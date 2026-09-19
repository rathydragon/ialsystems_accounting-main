import React, { useState, useEffect } from 'react';
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
  KeyRound,
  Radio,
  RefreshCw,
  FolderLock
} from 'lucide-react';
import { AppSettings, AuthUser } from '../types';
import { sendTelegramNotification, autoDetectChatId } from '../services/telegramService';

interface SettingsPageProps {
  settings: AppSettings;
  user?: AuthUser | null;
  onSaveSettings: (newSettings: AppSettings) => void;
  onResetData?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  user,
  onSaveSettings,
  onResetData
}) => {
  const isAdmin = user?.role === 'ADMIN';

  // Navigation tab within Settings
  const [activeTab, setActiveTab] = useState<'ALL' | 'GOOGLE' | 'FIREBASE' | 'TELEGRAM' | 'SECURITY'>('ALL');

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

  // Ping Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Save State
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

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
    setExchangeRate(settings.exchangeRate !== undefined ? settings.exchangeRate.toString() : '4100');
    setGoogleClientId(settings.googleClientId || '');
    setAllowedEmails(settings.allowedEmails || '');
    setAdminPin(settings.adminPin || '');
    setFirebaseApiKey(settings.firebaseApiKey || '');
    setFirebaseProjectId(settings.firebaseProjectId || '');
    setFirebaseAppId(settings.firebaseAppId || '');
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
    } catch (err: any) {
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
      setTgTestStatus({
        ok: false,
        msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}`
      });
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
        msg: `⚠️ Chat ID ដែលបានបញ្ចូល (${telegramChatId}) គឺជា ID របស់ Bot ផ្ទាល់ខ្លួន មិនមែនជា ID របស់អ្នកទទួលសារទេ!\n\n👉 ដំណោះស្រាយ៖ សូមចុចប៊ូតុង "✨ Auto-Detect" ខាងក្រោមដើម្បីឱ្យប្រព័ន្ធទាញយក Chat ID ពិតប្រាកដដោយស្វ័យប្រវត្តិ។`
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
        setTgTestStatus({
          ok: true,
          msg: 'បានផ្ញើសារតេស្តទៅកាន់ Telegram ដោយជោគជ័យ! សូមពិនិត្យមើល Telegram របស់អ្នក។'
        });
      } else {
        setTgTestStatus({
          ok: false,
          msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ សូមពិនិត្យ Bot Token និង Chat ID'}`
        });
      }
    } catch (err: any) {
      setTgTestStatus({
        ok: false,
        msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់ទៅកាន់ Telegram Service បានទេ')
      });
    } finally {
      setIsTestingTg(false);
    }
  };

  // Telegram Bot #2 Auto-Detect & Test
  const handleAutoDetectPaymentChatId = async () => {
    const token = (telegramPaymentBotToken || telegramBotToken).trim();
    if (!token) {
      setTgPaymentTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token សម្រាប់ Payment Collection ជាមុនសិន!' });
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
      setTgPaymentTestStatus({
        ok: false,
        msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}`
      });
    } finally {
      setIsDetectingPaymentChatId(false);
    }
  };

  const handleTestPaymentTelegram = async () => {
    const token = (telegramPaymentBotToken || telegramBotToken).trim();
    const chatId = telegramPaymentChatId.trim();

    if (!token) {
      setTgPaymentTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token សម្រាប់ Payment Collection ជាមុនសិន!' });
      return;
    }
    if (!chatId) {
      setTgPaymentTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Chat ID សម្រាប់ Payment Collection ជាមុនសិន!' });
      return;
    }

    const tokenPrefix = token.split(':')[0];
    if (tokenPrefix && chatId === tokenPrefix) {
      setTgPaymentTestStatus({
        ok: false,
        msg: `⚠️ Chat ID ដែលបានបញ្ចូល (${chatId}) គឺជា ID របស់ Bot ផ្ទាល់ខ្លួន មិនមែនជា ID របស់អ្នកទទួលសារទេ!\n\n👉 ដំណោះស្រាយ៖ សូមចុចប៊ូតុង "✨ Auto-Detect" ដើម្បីទាញយក Chat ID ពិតប្រាកដដោយស្វ័យប្រវត្តិ។`
      });
      return;
    }

    setIsTestingPaymentTg(true);
    setTgPaymentTestStatus(null);

    try {
      const testMsg = `📦 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #2 (PAYMENT COLLECTION)</b>\n\n✅ ក្រុមការងារ Payment Collection ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}\n\n<i>ប្រព័ន្ធនឹងផ្ញើសារជូនដំណឹងដោយស្វ័យប្រវត្តិនូវរាល់កញ្ចប់ប្រមូលប្រាក់ដែលបានរក្សាទុក។</i>`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: token,
        chatId: chatId,
        text: testMsg,
        parseMode: 'HTML',
        botType: 'PAYMENT'
      });

      if (res.success) {
        setTgPaymentTestStatus({
          ok: true,
          msg: 'បានផ្ញើសារតេស្ត Payment Collection ទៅកាន់ Telegram ដោយជោគជ័យ! សូមពិនិត្យមើល Telegram របស់អ្នក។'
        });
      } else {
        setTgPaymentTestStatus({
          ok: false,
          msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ សូមពិនិត្យ Bot Token និង Chat ID'}`
        });
      }
    } catch (err: any) {
      setTgPaymentTestStatus({
        ok: false,
        msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់ទៅកាន់ Telegram Service បានទេ')
      });
    } finally {
      setIsTestingPaymentTg(false);
    }
  };

  // Telegram Bot #3 Auto-Detect & Test
  const handleAutoDetectLogChatId = async () => {
    const token = (telegramLogBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    if (!token) {
      setTgLogTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token សម្រាប់ User Logs ជាមុនសិន!' });
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
      setTgLogTestStatus({
        ok: false,
        msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}`
      });
    } finally {
      setIsDetectingLogChatId(false);
    }
  };

  const handleTestLogTelegram = async () => {
    const token = (telegramLogBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    const chatId = telegramLogChatId.trim();

    if (!token) {
      setTgLogTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    if (!chatId) {
      setTgLogTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Chat ID សម្រាប់ Log ដំណឹងជាមុនសិន!' });
      return;
    }

    const tokenPrefix = token.split(':')[0];
    if (tokenPrefix && chatId === tokenPrefix) {
      setTgLogTestStatus({
        ok: false,
        msg: `⚠️ Chat ID ដែលបានបញ្ចូល (${chatId}) គឺជា ID របស់ Bot ផ្ទាល់ខ្លួន មិនមែនជា ID របស់អ្នកទទួលសារទេ!\n\n👉 ដំណោះស្រាយ៖ សូមចុចប៊ូតុង "✨ Auto-Detect" ដើម្បីទាញយក Chat ID ពិតប្រាកដដោយស្វ័យប្រវត្តិ។`
      });
      return;
    }

    setIsTestingLogTg(true);
    setTgLogTestStatus(null);

    try {
      const testMsg = `📜 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #3 (USER ACTIVITY LOGS)</b>\n\n✅ ក្រុមការងារ/Admin ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot សម្រាប់ User Activity Logs ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}\n👤 អ្នកធ្វើតេស្ត៖ ${user?.displayName || user?.email || 'Admin'}\n\n<i>រាល់ពេលមានអ្នកប្រើប្រាស់ Login, កត់ត្រាកញ្ចប់, ប្តូរសិទ្ធិ ឬលុបទិន្នន័យ នឹងមានសារ Alert ចូលមកទីនេះភ្លាមៗ។</i>`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: token,
        chatId: chatId,
        text: testMsg,
        parseMode: 'HTML',
        botType: 'LOG'
      });

      if (res.success) {
        setTgLogTestStatus({
          ok: true,
          msg: 'បានផ្ញើសារតេស្ត Log ទៅកាន់ Telegram ដោយជោគជ័យ! សូមពិនិត្យមើល Telegram Group/Channel របស់អ្នក។'
        });
      } else {
        setTgLogTestStatus({
          ok: false,
          msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ សូមពិនិត្យ Bot Token និង Chat ID'}`
        });
      }
    } catch (err: any) {
      setTgLogTestStatus({
        ok: false,
        msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់ទៅកាន់ Telegram Service បានទេ')
      });
    } finally {
      setIsTestingLogTg(false);
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
      exchangeRate: parseFloat(exchangeRate) || 4100,
      googleClientId: googleClientId.trim(),
      allowedEmails: allowedEmails.trim(),
      adminPin: adminPin.trim(),
      firebaseApiKey: firebaseApiKey.trim(),
      firebaseProjectId: firebaseProjectId.trim(),
      firebaseAppId: firebaseAppId.trim()
    };

    onSaveSettings(updatedSettings);
    setIsSavedRecently(true);
    setSaveToast('បានរក្សាទុកការកំណត់ប្រព័ន្ធជោគជ័យ និង Sync ទៅកាន់ Cloud រួចរាល់!');
    setTimeout(() => {
      setIsSavedRecently(false);
      setSaveToast(null);
    }, 4000);
  };

  const isConnected = !!webAppUrl?.trim();
  const isFirebaseActive = !!firebaseProjectId?.trim() && !!firebaseApiKey?.trim();
  const isTg1Active = !!telegramBotToken?.trim() && !!telegramChatId?.trim();
  const isTg2Active = (!!telegramPaymentBotToken?.trim() || !!telegramBotToken?.trim()) && !!telegramPaymentChatId?.trim();
  const isTg3Active = telegramLogAlertsEnabled && (!!telegramLogBotToken?.trim() || !!telegramPaymentBotToken?.trim() || !!telegramBotToken?.trim()) && !!telegramLogChatId?.trim();

  return (
    <div className="space-y-6 animate-in fade-in duration-200 pb-16">
      
      {/* Toast Banner */}
      {saveToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-600 text-white rounded-2xl shadow-xl shadow-emerald-500/20 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  ការកំណត់ប្រព័ន្ធ និង API (System & API Settings)
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                គ្រប់គ្រងការតភ្ជាប់ Google Apps Script, Google Sheets, Firebase Firestore, Telegram Bots ទាំង ៣ និងការកំណត់សុវត្ថិភាព
              </p>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !webAppUrl.trim()}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            title="តេស្តតភ្ជាប់ Google Apps Script Web App"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Radio className="w-4 h-4 text-blue-500" />}
            <span className="hidden sm:inline">Ping Test</span>
          </button>

          <button
            id="btn-save-settings-top"
            type="button"
            onClick={handleSave}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-md cursor-pointer ${
              isSavedRecently
                ? 'bg-emerald-600 text-white shadow-emerald-500/30'
                : 'bg-[#0d1b3e] hover:bg-[#152a5e] text-white border-b-2 border-red-500 shadow-blue-900/20'
            }`}
          >
            {isSavedRecently ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSavedRecently ? 'រក្សាទុកជោគជ័យ' : 'រក្សាទុកការកំណត់'}</span>
          </button>
        </div>
      </div>

      {/* Status Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. Google Web App Status */}
        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 transition ${
          isConnected
            ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/60'
            : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
        }`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 ${
            isConnected ? 'bg-blue-500 text-white' : 'bg-rose-500 text-white'
          }`}>
            <Globe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
              Google Apps Script
            </div>
            <div className={`text-[10px] font-semibold flex items-center gap-1 ${
              isConnected ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-blue-500' : 'bg-rose-500'}`} />
              {isConnected ? 'Online & Ready' : 'Not Connected'}
            </div>
          </div>
        </div>

        {/* 2. Firebase Firestore Status */}
        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 transition ${
          isFirebaseActive
            ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 ${
            isFirebaseActive ? 'bg-amber-500 text-white' : 'bg-slate-400 text-white'
          }`}>
            <Flame className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
              Firebase Firestore
            </div>
            <div className={`text-[10px] font-semibold flex items-center gap-1 ${
              isFirebaseActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isFirebaseActive ? 'bg-amber-500' : 'bg-slate-400'}`} />
              {isFirebaseActive ? 'Realtime Sync Active' : 'Local Cache'}
            </div>
          </div>
        </div>

        {/* 3. Telegram Alerts Status */}
        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 transition ${
          (isTg1Active || isTg2Active || isTg3Active)
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        }`}>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 ${
            (isTg1Active || isTg2Active || isTg3Active) ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white'
          }`}>
            <Send className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
              Telegram Bots
            </div>
            <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {[isTg1Active, isTg2Active, isTg3Active].filter(Boolean).length}/3 Bots Active
            </div>
          </div>
        </div>

        {/* 4. Exchange Rate */}
        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#0d1b3e] text-white flex items-center justify-center font-mono font-black shrink-0">
            $
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
              អត្រាប្តូរប្រាក់ (Rate)
            </div>
            <div className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
              $1 = {parseInt(exchangeRate || '4100').toLocaleString()} ៛
            </div>
          </div>
        </div>
      </div>

      {/* Category Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'ALL' as const, label: 'គ្រប់ការកំណត់ (All)', icon: Layers },
          { id: 'GOOGLE' as const, label: 'Google & Cloud Sync', icon: Globe },
          { id: 'FIREBASE' as const, label: 'Firebase Firestore', icon: Flame },
          { id: 'TELEGRAM' as const, label: 'Telegram Bot Center (3 Bots)', icon: Send },
          { id: 'SECURITY' as const, label: 'សុវត្ថិភាព & អត្រាប្តូរប្រាក់', icon: ShieldCheck }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Settings Body Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT COLUMN: Google & Firebase & General */}
        {(activeTab === 'ALL' || activeTab === 'GOOGLE' || activeTab === 'FIREBASE') && (
          <div className="space-y-6">

            {/* CARD 1: Google Apps Script Web App (Cloud Backend) */}
            {(activeTab === 'ALL' || activeTab === 'GOOGLE') && (
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Google Apps Script Web App
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        មជ្ឈមណ្ឌលតភ្ជាប់ API (Vercel & Localhost ទៅកាន់ Google Cloud)
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                    Web App URL
                  </span>
                </div>

                {/* Cloud Persistence Notice */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-300">
                  <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold">Google Sheets Cloud Persistence (Tab "Settings")</p>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      រាល់ការកំណត់ទាំងអស់នឹងត្រូវ Sync រក្សាទុកក្នុង Google Sheets ដោយស្វ័យប្រវត្តិ ធានាថាមិនបាត់បង់ពេល Deploy លើ Vercel ឬពេលប្រើលើទូរស័ព្ទ/កុំព្យូទ័រផ្សេងគ្នា!
                    </p>
                  </div>
                </div>

                {/* Web App URL Input */}
                <div>
                  <label htmlFor="input-page-webAppUrl" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
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
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting || !webAppUrl.trim()}
                      className="px-4 py-2.5 rounded-xl bg-[#0d1b3e] hover:bg-[#152a5e] font-semibold text-white disabled:opacity-50 transition shrink-0 flex items-center gap-1.5 text-xs shadow-xs cursor-pointer"
                    >
                      {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5 text-blue-400" />}
                      <span>Ping Test</span>
                    </button>
                  </div>

                  {testStatus && (
                    <div className={`mt-2.5 p-3 rounded-xl flex items-center gap-2 text-xs ${
                      testStatus.ok 
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                        : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}>
                      {testStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                      <span>{testStatus.msg}</span>
                    </div>
                  )}
                </div>

                {/* Google Spreadsheet ID */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="input-page-sheet-id" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>GOOGLE SPREADSHEET ID / LINK</span>
                    </label>
                    {isAdmin ? (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                        Admin Authorized
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800 flex items-center gap-1">
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
                      placeholder="18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k ឬ Paste Link ពេញ"
                      value={spreadsheetId}
                      onChange={(e) => {
                        if (!isAdmin) return;
                        const val = e.target.value;
                        const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                        setSpreadsheetId(match ? match[1] : val.trim());
                      }}
                      className={`flex-1 px-3.5 py-2.5 rounded-xl border font-mono text-xs focus:outline-none ${
                        isAdmin
                          ? 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-600'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      }`}
                    />
                    {spreadsheetId.trim() && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${spreadsheetId.trim()}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-semibold text-xs flex items-center gap-1 shrink-0"
                        title="បើក Google Sheet ផ្ទាល់"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">បើក Sheet</span>
                      </a>
                    )}
                  </div>
                  <p className="text-[10.5px] text-slate-400 mt-1">
                    លោកអ្នកអាចបញ្ចូល ID ដោយផ្ទាល់ ឬបិទភ្ជាប់ (Paste) Link ពេញលេញរបស់ Google Sheet ប្រព័ន្ធនឹងស្រង់យក ID ដោយស្វ័យប្រវត្តិ។
                  </p>
                </div>

                {/* Google Drive Folder ID */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label htmlFor="input-page-drive-id" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    GOOGLE DRIVE FOLDER ID (សម្រាប់រក្សាទុករូបភាពវិក្កយបត្រ WebP)
                  </label>
                  <input
                    id="input-page-drive-id"
                    type="text"
                    placeholder="1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w"
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value.trim())}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            )}

            {/* CARD 2: Firebase Firestore Database Configuration */}
            {(activeTab === 'ALL' || activeTab === 'FIREBASE') && (
              <div className="p-5 rounded-2xl border border-amber-500/30 dark:border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Firebase Firestore Database
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Realtime Live Sync សម្រាប់ Batches និង Collection Items
                      </p>
                    </div>
                  </div>
                  {isFirebaseActive ? (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Live Sync Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                      Local Cache Active
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  ទិន្នន័យកញ្ចប់ (Batches) និងមុខទំនិញ (Collection Items) ត្រូវបានផ្តាច់ចេញពី Google Sheets និងរក្សាទុកក្នុង Firebase Firestore ផ្ទាល់ ធានា Realtime Live Sync និងគ្មានបញ្ហាជាប់ Lock ពេលអ្នកប្រើច្រើននាក់កត់ត្រាក្នុងពេលតែមួយឡើយ។
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      FIREBASE PROJECT ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ialexpress"
                      value={firebaseProjectId}
                      onChange={(e) => setFirebaseProjectId(e.target.value.trim())}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      FIREBASE API KEY
                    </label>
                    <div className="relative">
                      <input
                        type={showFirebaseKey ? "text" : "password"}
                        placeholder="AIzaSy..."
                        value={firebaseApiKey}
                        onChange={(e) => setFirebaseApiKey(e.target.value.trim())}
                        className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFirebaseKey(!showFirebaseKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showFirebaseKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      FIREBASE APP ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="1:494989224946:web:590a34eace464d1a82d96b"
                      value={firebaseAppId}
                      onChange={(e) => setFirebaseAppId(e.target.value.trim())}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* RIGHT COLUMN: Telegram Bots & Security */}
        {(activeTab === 'ALL' || activeTab === 'TELEGRAM' || activeTab === 'SECURITY') && (
          <div className="space-y-6">

            {/* CARD 3: Telegram Bot Center */}
            {(activeTab === 'ALL' || activeTab === 'TELEGRAM') && (
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                      <Send className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Telegram Bot Alert Center
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        ប្រព័ន្ធផ្ញើសារជូនដំណឹង Telegram ទាំង ៣ ដាច់ដោយឡែកពីគ្នា
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                  >
                    @BotFather <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Sub-Card: Bot #1 Reconciliation & Main */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                      <Send className="w-3.5 h-3.5 text-sky-500" />
                      <span>TELEGRAM BOT #1 (RECONCILIATION & MAIN)</span>
                    </span>
                    <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-300 dark:border-sky-800">
                      Reconciliation
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                        className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Chat ID / Group ID (Reconciliation)
                      </label>
                      <a
                        href="https://t.me/userinfobot"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-slate-400 hover:text-sky-500 hover:underline flex items-center gap-0.5"
                      >
                        @userinfobot <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g., 924306058 or -100123456789"
                        value={telegramChatId}
                        onChange={(e) => {
                          setTelegramChatId(e.target.value);
                          setTgTestStatus(null);
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleAutoDetectChatId}
                        disabled={isDetectingChatId || !telegramBotToken.trim()}
                        className="px-2.5 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-100 font-semibold transition disabled:opacity-50 text-xs flex items-center gap-1 shrink-0"
                      >
                        {isDetectingChatId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={isTestingTg || !telegramBotToken.trim() || !telegramChatId.trim()}
                        className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                      >
                        {isTestingTg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Test Alert</span>
                      </button>
                    </div>
                  </div>

                  {tgTestStatus && (
                    <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                      tgTestStatus.ok 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}>
                      {tgTestStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />}
                      <span className="whitespace-pre-line">{tgTestStatus.msg}</span>
                    </div>
                  )}
                </div>

                {/* Sub-Card: Bot #2 Payment Collection Specific */}
                <div className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                      <Package className="w-3.5 h-3.5 text-emerald-600" />
                      <span>TELEGRAM BOT #2 (PAYMENT COLLECTION ALERTS)</span>
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                      Payment Collection
                    </span>
                  </div>

                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    ផ្ញើសារជូនដំណឹងដោយស្វ័យប្រវត្តិនូវរាល់ <strong>កញ្ចប់ប្រមូលប្រាក់ (Payment Collection)</strong> ចូល Group ឬ Chat ជាក់លាក់។
                  </p>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Bot Token <span className="text-[10px] text-slate-400 font-normal">(ទុកទទេដើម្បីប្រើ Bot Token ខាងលើ)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPaymentToken ? "text" : "password"}
                        placeholder={telegramBotToken ? "កំពុងប្រើ Bot Token #1 ស្វ័យប្រវត្តិ (ឬបញ្ចូល Token ថ្មី)" : "e.g. 8859388289:AAHzv7..."}
                        value={telegramPaymentBotToken}
                        onChange={(e) => {
                          setTelegramPaymentBotToken(e.target.value);
                          setTgPaymentTestStatus(null);
                        }}
                        className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPaymentToken(!showPaymentToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showPaymentToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Collection Chat ID / Group ID
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. -100123456789 (Group) ឬ 924306058"
                        value={telegramPaymentChatId}
                        onChange={(e) => {
                          setTelegramPaymentChatId(e.target.value);
                          setTgPaymentTestStatus(null);
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={handleAutoDetectPaymentChatId}
                        disabled={isDetectingPaymentChatId || (!telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                        className="px-2.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-semibold transition disabled:opacity-50 text-xs flex items-center gap-1 shrink-0"
                      >
                        {isDetectingPaymentChatId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestPaymentTelegram}
                        disabled={isTestingPaymentTg || (!telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramPaymentChatId.trim()}
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                      >
                        {isTestingPaymentTg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Test Alert</span>
                      </button>
                    </div>
                  </div>

                  {tgPaymentTestStatus && (
                    <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                      tgPaymentTestStatus.ok 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}>
                      {tgPaymentTestStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />}
                      <span className="whitespace-pre-line">{tgPaymentTestStatus.msg}</span>
                    </div>
                  )}
                </div>

                {/* Sub-Card: Bot #3 User Activity Logs & Audit Trail */}
                <div className="p-4 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5 text-xs">
                      <Activity className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>TELEGRAM BOT #3 (USER ACTIVITY LOGS ALERT)</span>
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={telegramLogAlertsEnabled}
                        onChange={(e) => setTelegramLogAlertsEnabled(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300">
                        {telegramLogAlertsEnabled ? 'បើកដំណើរការ (Active)' : 'បិទ (Disabled)'}
                      </span>
                    </label>
                  </div>

                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    ផ្ញើសារ Alert ភ្លាមៗរាល់ពេលមានសកម្មភាពអ្នកប្រើប្រាស់ (ចូលប្រព័ន្ធ, កត់ត្រាកញ្ចប់, ប្តូរសិទ្ធិ, ឬលុបទិន្នន័យ) ចូល Group/Channel ដាច់ដោយឡែក។
                  </p>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Log Bot Token <span className="text-[10px] text-slate-400 font-normal">(ទុកទទេបើប្រើ Bot ដូចខាងលើ)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showLogToken ? "text" : "password"}
                        placeholder="e.g. 8859388289:AAHzv7... (ទុកទទេបើប្រើ Bot #1 ឬ #2)"
                        value={telegramLogBotToken}
                        onChange={(e) => {
                          setTelegramLogBotToken(e.target.value);
                          setTgLogTestStatus(null);
                        }}
                        className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLogToken(!showLogToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showLogToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        Telegram Chat ID ថ្មី (សម្រាប់ Logs តែម្ដង)
                      </label>
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                        Dedicated Log Channel / Group
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g., -100123456789 (Channel/Group ID សម្រាប់ Log)"
                        value={telegramLogChatId}
                        onChange={(e) => {
                          setTelegramLogChatId(e.target.value);
                          setTgLogTestStatus(null);
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      />
                      <button
                        type="button"
                        onClick={handleAutoDetectLogChatId}
                        disabled={isDetectingLogChatId || (!telegramLogBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                        className="px-2.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 font-semibold transition disabled:opacity-50 text-xs flex items-center gap-1 shrink-0"
                      >
                        {isDetectingLogChatId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestLogTelegram}
                        disabled={isTestingLogTg || (!telegramLogBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramLogChatId.trim()}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                      >
                        {isTestingLogTg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Test Alert</span>
                      </button>
                    </div>
                  </div>

                  {tgLogTestStatus && (
                    <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                      tgLogTestStatus.ok 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}>
                      {tgLogTestStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />}
                      <span className="whitespace-pre-line">{tgLogTestStatus.msg}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CARD 4: Security, Exchange Rate & Access Control */}
            {(activeTab === 'ALL' || activeTab === 'SECURITY') && (
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        សុវត្ថិភាព និងអត្រាប្តូរប្រាក់ (Security & Currency)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        អត្រាប្តូរប្រាក់ 1 USD = ? KHR, Google Client ID, PIN និង Whitelist
                      </p>
                    </div>
                  </div>
                </div>

                {/* Exchange Rate */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-[#0d1b3e] text-white flex items-center justify-center font-mono text-xs font-bold">$</span>
                      <span>EXCHANGE RATE (អត្រាប្តូរប្រាក់ 1 USD = ? KHR)</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Default: 4,100៛</span>
                  </div>

                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-xs">
                        $1 =
                      </span>
                      <input
                        type="number"
                        step="10"
                        min="1000"
                        placeholder="4100"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(e.target.value)}
                        className="w-full pl-12 pr-8 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">៛</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {[4000, 4050, 4100, 4120].map((presetVal) => (
                        <button
                          key={presetVal}
                          type="button"
                          onClick={() => setExchangeRate(presetVal.toString())}
                          className={`px-2.5 py-2 rounded-xl text-xs font-mono font-bold transition border cursor-pointer ${
                            exchangeRate === presetVal.toString()
                              ? 'bg-[#0d1b3e] text-white border-[#0d1b3e]'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {presetVal}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Google Sign-In Client ID */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Google OAuth 2.0 Client ID
                    </label>
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      Get Client ID <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 594375780266-3pu9am9mgelmd08f0fkc06n3m2gho1bn.apps.googleusercontent.com"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value.trim())}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Allowed Gmails */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Allowed Gmails (Email Whitelist)
                  </label>
                  <input
                    type="text"
                    placeholder="owner@gmail.com, accountant@gmail.com (ទុកទទេដើម្បីអនុញ្ញាតគ្រប់ Gmail)"
                    value={allowedEmails}
                    onChange={(e) => setAllowedEmails(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <p className="text-[10.5px] text-slate-400 mt-1">
                    បញ្ចូល Gmail ដែលមានសិទ្ធិចូលប្រើ (ញែកដោយសញ្ញាក្បៀស)។ បើទុកទទេ គ្រប់ Gmail ទាំងអស់អាចចូលបាន។
                  </p>
                </div>

                {/* Admin PIN */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-amber-500" />
                      Admin PIN Code (សម្រាប់ Direct Login តាម Wi-Fi / IP)
                    </label>
                    <span className="text-[10px] text-slate-400">Default: 123456</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showAdminPin ? "text" : "password"}
                      placeholder="លេខកូដ PIN..."
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value.trim())}
                      className="w-full px-3.5 py-2 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPin(!showAdminPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showAdminPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Danger Zone: Reset Local Data */}
                {onResetData && (
                  <div className="pt-4 border-t border-rose-200 dark:border-rose-900/60 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <FolderLock className="w-3.5 h-3.5" />
                        <span>កំណត់ឡើងវិញ (Reset Local Cache)</span>
                      </div>
                      <p className="text-[10.5px] text-slate-400">
                        លុបទិន្នន័យបណ្តោះអាសន្ន Cache លើឧបករណ៍នេះ (មិនប៉ះពាល់ទិន្នន័យលើ Cloud ឡើយ)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('តើលោកអ្នកពិតជាចង់កំណត់ទិន្នន័យ Local Cache ឡើងវិញមែនទេ?')) {
                          onResetData();
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-semibold text-xs transition cursor-pointer"
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

      {/* Sticky Bottom Save Action Bar */}
      <div className="sticky bottom-4 z-30 flex items-center justify-between p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            រាល់ការផ្លាស់ប្តូរតម្រូវឱ្យចុច <strong>"រក្សាទុកការកំណត់"</strong> ដើម្បី Sync ទៅ Cloud
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-save-settings-bottom"
            type="button"
            onClick={handleSave}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-md cursor-pointer ${
              isSavedRecently
                ? 'bg-emerald-600 text-white shadow-emerald-500/30'
                : 'bg-[#0d1b3e] hover:bg-[#152a5e] text-white border-b-2 border-red-500 shadow-blue-900/20'
            }`}
          >
            {isSavedRecently ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSavedRecently ? 'រក្សាទុកជោគជ័យ' : 'រក្សាទុកការកំណត់'}</span>
          </button>
        </div>
      </div>

    </div>
  );
};
