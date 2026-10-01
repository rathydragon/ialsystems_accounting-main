import React, { useState } from 'react';
import { 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Globe, 
  RotateCcw, 
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Users,
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
  Camera,
  Server,
  Clock
} from 'lucide-react';
import { AppSettings, AuthUser } from '../types';
import { sendTelegramNotification, autoDetectChatId } from '../services/telegramService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  user?: AuthUser | null;
  onSaveSettings: (newSettings: AppSettings) => void;
  onResetData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  user,
  onSaveSettings,
  onResetData
}) => {
  const isAdmin = user?.role === 'ADMIN';
  const [webAppUrl, setWebAppUrl] = useState(settings.webAppUrl);
  const [spreadsheetId, setSpreadsheetId] = useState(settings.spreadsheetId || '');
  
  // Telegram Bot #1: Main / Reconciliation
  const [telegramBotToken, setTelegramBotToken] = useState(settings.telegramBotToken || '');
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId);
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

  // Telegram Bot #4: Bank Slip & AWBN Alert
  const [telegramSlipBotToken, setTelegramSlipBotToken] = useState(settings.telegramSlipBotToken || '');
  const [telegramSlipChatId, setTelegramSlipChatId] = useState(settings.telegramSlipChatId || '');
  const [telegramSlipAlertsEnabled, setTelegramSlipAlertsEnabled] = useState(settings.telegramSlipAlertsEnabled !== false);
  const [showSlipToken, setShowSlipToken] = useState(false);
  const [isTestingSlipTg, setIsTestingSlipTg] = useState(false);
  const [tgSlipTestStatus, setTgSlipTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDetectingSlipChatId, setIsDetectingSlipChatId] = useState(false);

  const [exchangeRate, setExchangeRate] = useState<string>(settings.exchangeRate !== undefined ? settings.exchangeRate.toString() : '4100');
  const [googleClientId, setGoogleClientId] = useState(settings.googleClientId || '');
  const [allowedEmails, setAllowedEmails] = useState(settings.allowedEmails || '');
  const [adminPin, setAdminPin] = useState(settings.adminPin || '');
  
  // Firebase Firestore Database Settings
  const [firebaseApiKey, setFirebaseApiKey] = useState(settings.firebaseApiKey || '');
  const [firebaseProjectId, setFirebaseProjectId] = useState(settings.firebaseProjectId || '');
  const [firebaseAppId, setFirebaseAppId] = useState(settings.firebaseAppId || '');
  const [showFirebaseKey, setShowFirebaseKey] = useState(false);

  // Google Gemini AI Vision Settings
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || localStorage.getItem('ial_gemini_api_key') || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // PostgreSQL Local Backup State
  const [isBackingUpPg, setIsBackingUpPg] = useState(false);
  const [pgBackupStatus, setPgBackupStatus] = useState<{ ok: boolean; msg: string; time?: string } | null>(() => {
    try {
      const last = localStorage.getItem('last_pg_backup_info');
      return last ? JSON.parse(last) : null;
    } catch {
      return null;
    }
  });

  const handleTriggerPgBackup = async () => {
    setIsBackingUpPg(true);
    setPgBackupStatus(null);
    try {
      const res = await fetch('/api/backup-postgres', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        const info = {
          ok: true,
          msg: 'បាន Backup ចូល PostgreSQL ជោគជ័យ! (Batches, Medicine, Permissions, Logs...)',
          time: new Date().toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        setPgBackupStatus(info);
        localStorage.setItem('last_pg_backup_info', JSON.stringify(info));
      } else {
        setPgBackupStatus({
          ok: false,
          msg: data.message || 'បរាជ័យក្នុងការ Backup។ សូមពិនិត្យមើលថាតើ PostgreSQL Service បានបើកដំណើរការហើយឬនៅ។'
        });
      }
    } catch (err: any) {
      setPgBackupStatus({
        ok: false,
        msg: 'មិនអាចទាក់ទង Local API បានទេ។ សូមប្រាកដថាកម្មវិធីដំណើរការលើ Local Machine (localhost:3000)។'
      });
    } finally {
      setIsBackingUpPg(false);
    }
  };

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!webAppUrl.trim()) {
      setTestStatus({ ok: false, msg: 'Please enter a Web App URL first.' });
      return;
    }

    setIsTesting(true);
    setTestStatus(null);

    try {
      const response = await fetch(webAppUrl.trim(), {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setTestStatus({
          ok: true,
          msg: `Connected! ${data.message || 'API responded successfully.'}`
        });
      } else {
        setTestStatus({
          ok: false,
          msg: `HTTP ${response.status}: Failed to reach Web App.`
        });
      }
    } catch (err: any) {
      setTestStatus({
        ok: true,
        msg: 'URL format is valid! Ready for POST transaction syncing.'
      });
    } finally {
      setIsTesting(false);
    }
  };

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

    // Guard: Check if the user accidentally entered the bot's own ID
    const tokenPrefix = telegramBotToken.trim().split(':')[0];
    if (tokenPrefix && telegramChatId.trim() === tokenPrefix) {
      setTgTestStatus({
        ok: false,
        msg: `⚠️ Chat ID ដែលបានបញ្ចូល (${telegramChatId}) គឺជា ID របស់ Bot ផ្ទាល់ខ្លួន មិនមែនជា ID របស់អ្នកទទួលសារទេ!\n\n👉 ដំណោះស្រាយ៖ សូមចុចប៊ូតុង "✨ Auto-Detect Chat ID" ខាងក្រោមដើម្បីឱ្យប្រព័ន្ធទាញយក Chat ID របស់អ្នកពិតប្រាកដដោយស្វ័យប្រវត្តិ។`
      });
      return;
    }

    setIsTestingTg(true);
    setTgTestStatus(null);

    try {
      const testMsg = `🔔 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT</b>\n\n✅ ប្រព័ន្ធកត់ត្រាគណនេយ្យត្រូវបានភ្ជាប់ជាមួយ Telegram Bot របស់អ្នកដោយជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}\n\n<i>ប្រព័ន្ធរួចរាល់សម្រាប់ការផ្ញើសារជូនដំណឹងភ្លាមៗរាល់ពេលកត់ត្រាប្រតិបត្តិការ។</i>`;
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
      const testMsg = `📦 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT (PAYMENT COLLECTION)</b>\n\n✅ ក្រុមការងារ Payment Collection ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}\n\n<i>ប្រព័ន្ធនឹងផ្ញើសារជូនដំណឹងដោយស្វ័យប្រវត្តិនូវរាល់កញ្ចប់ប្រមូលប្រាក់ដែលបានរក្សាទុក។</i>`;
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
      const testMsg = `📜 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT (USER ACTIVITY LOGS)</b>\n\n✅ ក្រុមការងារ/Admin ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot សម្រាប់ User Activity Logs ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}\n👤 អ្នកធ្វើតេស្ត៖ ${user?.displayName || user?.email || 'Admin'}\n\n<i>រាល់ពេលមានអ្នកប្រើប្រាស់ Login, កត់ត្រាកញ្ចប់, ប្តូរសិទ្ធិ ឬលុបទិន្នន័យ នឹងមានសារ Alert ចូលមកទីនេះភ្លាមៗ។</i>`;
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

  // Telegram Bot #4 Auto-Detect & Test (Bank Slip & AWBN)
  const handleAutoDetectSlipChatId = async () => {
    const token = (telegramSlipBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    if (!token) {
      setTgSlipTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token សម្រាប់ Bank Slip ជាមុនសិន!' });
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
      setTgSlipTestStatus({
        ok: false,
        msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}`
      });
    } finally {
      setIsDetectingSlipChatId(false);
    }
  };

  const handleTestSlipTelegram = async () => {
    const token = (telegramSlipBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    const chatId = telegramSlipChatId.trim();

    if (!token) {
      setTgSlipTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    if (!chatId) {
      setTgSlipTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Chat ID សម្រាប់ Bank Slip ជាមុនសិន!' });
      return;
    }

    const tokenPrefix = token.split(':')[0];
    if (tokenPrefix && chatId === tokenPrefix) {
      setTgSlipTestStatus({
        ok: false,
        msg: `⚠️ Chat ID ដែលបានបញ្ចូល (${chatId}) គឺជា ID របស់ Bot ផ្ទាល់ខ្លួន មិនមែនជា ID របស់អ្នកទទួលសារទេ!\n\n👉 ដំណោះស្រាយ៖ សូមចុចប៊ូតុង "✨ Auto-Detect" ដើម្បីទាញយក Chat ID ពិតប្រាកដដោយស្វ័យប្រវត្តិ។`
      });
      return;
    }

    setIsTestingSlipTg(true);
    setTgSlipTestStatus(null);

    try {
      const testMsg = `🧾 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #4 (BANK SLIP & AWBN ALERT)</b>\n\n✅ ក្រុមការងារ/Admin ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot សម្រាប់ Bank Slip ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}\n👤 អ្នកធ្វើតេស្ត៖ ${user?.displayName || user?.email || 'Admin'}\n\n<i>រាល់ពេលមានការបញ្ចូលរូបភាព Bank Slip និងលេខកូដ AWBN នឹងមានសារព្រមទាំងរូបភាពផ្ទាល់ផ្ញើចូលមកទីនេះភ្លាមៗ។</i>`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: token,
        chatId: chatId,
        text: testMsg,
        parseMode: 'HTML',
        botType: 'SLIP'
      });

      if (res.success) {
        setTgSlipTestStatus({
          ok: true,
          msg: 'បានផ្ញើសារតេស្ត Bank Slip ទៅកាន់ Telegram ដោយជោគជ័យ! សូមពិនិត្យមើល Telegram Group/Channel របស់អ្នក។'
        });
      } else {
        setTgSlipTestStatus({
          ok: false,
          msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ សូមពិនិត្យ Bot Token និង Chat ID'}`
        });
      }
    } catch (err: any) {
      setTgSlipTestStatus({
        ok: false,
        msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់ទៅកាន់ Telegram Service បានទេ')
      });
    } finally {
      setIsTestingSlipTg(false);
    }
  };

  const handleSave = () => {
    onSaveSettings({
      ...settings,
      webAppUrl: webAppUrl.trim(),
      spreadsheetId: isAdmin ? spreadsheetId.trim() : (settings.spreadsheetId || ''),
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
      exchangeRate: parseFloat(exchangeRate) || 4100,
      googleClientId: googleClientId.trim(),
      allowedEmails: allowedEmails.trim(),
      adminPin: adminPin.trim(),
      firebaseApiKey: firebaseApiKey.trim(),
      firebaseProjectId: firebaseProjectId.trim(),
      firebaseAppId: firebaseAppId.trim(),
      geminiApiKey: geminiApiKey.trim()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Integration & API Settings
              </h3>
              <p className="text-[11px] text-slate-500">
                Connect your deployed Google Apps Script Web App
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Body Form */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Web App URL */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="input-setting-url" className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-blue-900 dark:text-blue-400" />
                GOOGLE APPS SCRIPT WEB APP URL
              </label>
              <span className="text-[10px] text-slate-400 font-medium">From Deploy &gt; Web App</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="input-setting-url"
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={webAppUrl}
                onChange={(e) => {
                  setWebAppUrl(e.target.value);
                  setTestStatus(null);
                }}
                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 shadow-2xs"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !webAppUrl.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#0d1b3e] hover:bg-[#152a5e] font-semibold text-white disabled:opacity-50 transition shrink-0 flex items-center justify-center gap-1.5 text-xs shadow-xs cursor-pointer active:scale-98"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Ping Test'}
              </button>
            </div>

            {testStatus && (
              <div className={`mt-2 p-2.5 rounded-xl flex items-center gap-2 text-[11px] ${
                testStatus.ok 
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                  : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}>
                {testStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                <span>{testStatus.msg}</span>
              </div>
            )}
          </div>

          {/* 🔥 Firebase Firestore Database Configuration (Batches & Items) */}
          <div className="p-3.5 rounded-xl border border-amber-500/30 dark:border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                <span>FIREBASE FIRESTORE (Batches & Collection Items)</span>
              </label>
              {firebaseProjectId.trim() && firebaseApiKey.trim() ? (
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Live Sync Active
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                  Local Cache Active
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  FIREBASE PROJECT ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. my-accounting-app"
                  value={firebaseProjectId}
                  onChange={(e) => setFirebaseProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  FIREBASE API KEY
                </label>
                <div className="relative">
                  <input
                    type={showFirebaseKey ? "text" : "password"}
                    placeholder="AIzaSy..."
                    value={firebaseApiKey}
                    onChange={(e) => setFirebaseApiKey(e.target.value)}
                    className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFirebaseKey(!showFirebaseKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showFirebaseKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  FIREBASE APP ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="1:123456789:web:abcdef"
                  value={firebaseAppId}
                  onChange={(e) => setFirebaseAppId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Google Spreadsheet ID / Link Configuration */}
          <div className={`p-3.5 rounded-xl border ${isAdmin ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40' : 'border-amber-200/60 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20'} space-y-2`}>
            <div className="flex items-center justify-between">
              <label htmlFor="input-setting-sheet-id" className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>GOOGLE SPREADSHEET ID / LINK</span>
              </label>
              {isAdmin ? (
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  Admin Authorized
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  ប្ដូរបានតែ Admin ប៉ុណ្ណោះ
                </span>
              )}
            </div>

            <div className="relative">
              <input
                id="input-setting-sheet-id"
                type="text"
                disabled={!isAdmin}
                placeholder="1SOAJ0-ipwJ6iSvEzMGqwny7ofbKTjsdnVdvz8eYLtnw ឬ Paste Link ពេញ"
                value={spreadsheetId}
                onChange={(e) => {
                  if (!isAdmin) return;
                  const val = e.target.value;
                  const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                  setSpreadsheetId(match ? match[1] : val.trim());
                }}
                className={`w-full px-3 py-2.5 rounded-xl border font-mono text-xs focus:outline-none ${
                  isAdmin
                    ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-600'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                }`}
              />
            </div>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
              {isAdmin
                ? 'លោកអ្នកអាចចម្លងតែ ID (ឧទាហរណ៍៖ 1SOAJ0-ipwJ6i...) ឬបិទភ្ជាប់ (Paste) Link ពេញលេញរបស់ Google Sheet ដោយផ្ទាល់ ប្រព័ន្ធនឹងស្រង់យក ID ដោយស្វ័យប្រវត្តិ។'
                : '🔒 សិទ្ធិប្ដូរ Google Spreadsheet ID ត្រូវបានកំណត់សម្រាប់តែគណនី Admin ប៉ុណ្ណោះ។'}
            </p>
          </div>

          {/* Exchange Rate Configuration: អត្រាប្តូរប្រាក់ USD to KHR */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <span className="w-5 h-5 rounded-md bg-[#0d1b3e] text-white flex items-center justify-center font-mono text-xs font-bold">$</span>
                <span>EXCHANGE RATE (អត្រាប្តូរប្រាក់ 1 USD = ? KHR)</span>
              </span>
              <span className="text-[10px] text-slate-400">Default: 4,100៛</span>
            </div>

            <div>
              <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-xs">
                    $1 =
                  </span>
                  <input
                    id="input-setting-exchange"
                    type="number"
                    step="10"
                    min="1000"
                    placeholder="4100"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full pl-12 pr-8 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 shadow-2xs"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">៛</span>
                </div>

                <div className="grid grid-cols-4 sm:flex items-center gap-1.5">
                  {[4000, 4050, 4100, 4120].map((presetVal) => (
                    <button
                      key={presetVal}
                      type="button"
                      onClick={() => setExchangeRate(presetVal.toString())}
                      className={`py-1.5 px-2 rounded-lg text-xs font-mono font-semibold transition border text-center cursor-pointer active:scale-95 ${
                        exchangeRate === presetVal.toString()
                          ? 'bg-[#0d1b3e] text-white border-[#0d1b3e] shadow-2xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {presetVal}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                អត្រាប្តូរប្រាក់នេះនឹងប្រើប្រាស់សម្រាប់ការបម្លែងរវាងប្រអប់ AMOUNT USD និង AMOUNT KHR ដោយស្វ័យប្រវត្តិ។
              </p>
            </div>
          </div>

          {/* Google Sign-In Configuration */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>GOOGLE SIGN-IN & AUTHENTICATION</span>
              </span>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
              >
                Get Client ID <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div>
              <label htmlFor="input-setting-googleid" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Google OAuth 2.0 Client ID
              </label>
              <input
                id="input-setting-googleid"
                type="text"
                placeholder="e.g. 1234567890-xxx.apps.googleusercontent.com"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>

            <div>
              <label htmlFor="input-setting-allowed-emails" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Allowed Gmails (Email Whitelist)
              </label>
              <input
                id="input-setting-allowed-emails"
                type="text"
                placeholder="owner@gmail.com, accountant@gmail.com"
                value={allowedEmails}
                onChange={(e) => setAllowedEmails(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                បញ្ចូល Gmail ដែលមានសិទ្ធិចូលប្រើ (ញែកដោយសញ្ញាក្បៀស)។ បើទុកទទេ គ្រប់ Gmail ទាំងអស់អាចចូលបាន។
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-setting-admin-pin" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-500" />
                  Admin PIN Code (សម្រាប់ Direct Login តាម Local Network)
                </label>
                <span className="text-[10px] text-slate-400">កំណត់ក្នុង .env ឬទីនេះ</span>
              </div>
              <input
                id="input-setting-admin-pin"
                type="text"
                placeholder="កំណត់លេខកូដសម្ងាត់ PIN ថ្មី..."
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                លេខសម្ងាត់នេះប្រើសម្រាប់ការពារពេលចូលប្រើប្រព័ន្ធតាមរយៈ Wi-Fi / IP (Direct Sign-In)។
              </p>
            </div>
          </div>

          {/* Telegram Bot #1: General & Reconciliation Notifications */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                <Send className="w-4 h-4 text-sky-500" />
                <span>TELEGRAM BOT #1 (RECONCILIATION & MAIN)</span>
              </span>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5"
              >
                @BotFather <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            {/* Telegram Bot Token #1 */}
            <div>
              <label htmlFor="input-setting-bot-token" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Telegram Bot Token (HTTP API)
              </label>
              <div className="relative">
                <input
                  id="input-setting-bot-token"
                  type={showToken ? "text" : "password"}
                  placeholder="e.g. 7123456789:AAHxxxx-xxxx..."
                  value={telegramBotToken}
                  onChange={(e) => {
                    setTelegramBotToken(e.target.value);
                    setTgTestStatus(null);
                  }}
                  className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  title={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Telegram Chat ID #1 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-setting-chatid" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Telegram Chat ID / Group ID (Reconciliation)
                </label>
                <div className="flex items-center gap-2">
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-slate-400 hover:text-sky-500 hover:underline flex items-center gap-0.5"
                  >
                    @userinfobot <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  id="input-setting-chatid"
                  type="text"
                  placeholder="e.g., 987654321 or -100123456789"
                  value={telegramChatId}
                  onChange={(e) => {
                    setTelegramChatId(e.target.value);
                    setTgTestStatus(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 shadow-2xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleAutoDetectChatId}
                    disabled={isDetectingChatId || !telegramBotToken.trim()}
                    title="ទាញយក Chat ID ស្វ័យប្រវត្តិពី Telegram"
                    className="w-full py-2 px-3 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-100 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {isDetectingChatId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Auto-Detect</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={isTestingTg || !telegramBotToken.trim() || !telegramChatId.trim()}
                    className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                  >
                    {isTestingTg ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Alert</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Telegram Test Status Alert #1 */}
            {tgTestStatus && (
              <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                tgTestStatus.ok 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}>
                {tgTestStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />}
                <span className="whitespace-pre-line">{tgTestStatus.msg}</span>
              </div>
            )}
          </div>

          {/* Telegram Bot #2: Payment Collection Alerts (ការប្រមូលប្រាក់) */}
          <div className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                <Package className="w-4 h-4 text-emerald-600" />
                <span>TELEGRAM BOT #2 (PAYMENT COLLECTION ALERTS)</span>
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                Payment Collection
              </span>
            </div>

            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
              កំណត់ Telegram Bot សម្រាប់ផ្ញើសារជូនដំណឹងដោយស្វ័យប្រវត្តិនូវរាល់ **កញ្ចប់ប្រមូលប្រាក់ (Payment Collection)**។ អាចផ្ញើចូល Group ឬ Chat ផ្សេងពី Bot #1។
            </p>

            {/* Telegram Payment Bot Token */}
            <div>
              <label htmlFor="input-setting-pay-bot-token" className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Bot Token <span className="text-[10px] text-slate-400 font-normal">(ទុកទទេដើម្បីប្រើ Bot Token ខាងលើ)</span>
              </label>
              <div className="relative">
                <input
                  id="input-setting-pay-bot-token"
                  type={showPaymentToken ? "text" : "password"}
                  placeholder={telegramBotToken ? "កំពុងប្រើ Bot Token #1 ស្វ័យប្រវត្តិ (ឬបញ្ចូល Token ថ្មី)" : "e.g. 7123456789:AAHxxxx-xxxx..."}
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  title={showPaymentToken ? "Hide token" : "Show token"}
                >
                  {showPaymentToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Telegram Payment Chat ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-setting-pay-chatid" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Payment Collection Chat ID / Group ID
                </label>
                <div className="flex items-center gap-2">
                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-slate-400 hover:text-emerald-500 hover:underline flex items-center gap-0.5"
                  >
                    @userinfobot <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  id="input-setting-pay-chatid"
                  type="text"
                  placeholder="e.g. -100123456789 (Group) ឬ 987654321"
                  value={telegramPaymentChatId}
                  onChange={(e) => {
                    setTelegramPaymentChatId(e.target.value);
                    setTgPaymentTestStatus(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleAutoDetectPaymentChatId}
                    disabled={isDetectingPaymentChatId || (!telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                    title="ទាញយក Chat ID ស្វ័យប្រវត្តិពី Telegram"
                    className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {isDetectingPaymentChatId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Auto-Detect</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestPaymentTelegram}
                    disabled={isTestingPaymentTg || (!telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramPaymentChatId.trim()}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                  >
                    {isTestingPaymentTg ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Alert</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Telegram Test Status Alert #2 */}
            {tgPaymentTestStatus && (
              <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                tgPaymentTestStatus.ok 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}>
                {tgPaymentTestStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />}
                <span className="whitespace-pre-line">{tgPaymentTestStatus.msg}</span>
              </div>
            )}
          </div>

          {/* Telegram Bot #3: User Activity Logs & Audit Trail Alerts (កំណត់ត្រាសកម្មភាពអ្នកប្រើ) */}
          <div className="p-3.5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5 text-xs">
                <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>TELEGRAM BOT #3 (USER ACTIVITY LOGS ALERT)</span>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={telegramLogAlertsEnabled}
                  onChange={(e) => setTelegramLogAlertsEnabled(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300">
                  {telegramLogAlertsEnabled ? 'បើកដំណើរការ (Active)' : 'បិទ (Disabled)'}
                </span>
              </label>
            </div>

            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
              ផ្ញើសារជូនដំណឹងភ្លាមៗទៅកាន់ <strong>Telegram Channel ឬ Group ដាច់ដោយឡែក</strong> រាល់ពេលមានសកម្មភាពអ្នកប្រើប្រាស់ (ចូល/ចេញប្រព័ន្ធ, កត់ត្រាកញ្ចប់, កែប្រែសិទ្ធិ, ឬលុបទិន្នន័យ)។
            </p>

            {/* Telegram Log Bot Token */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-setting-log-bot-token" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Telegram Bot Token (Optional)
                </label>
                <span className="text-[10px] text-slate-400">ទុកទទេបើប្រើ Bot ដូចខាងលើ</span>
              </div>
              <div className="relative">
                <input
                  id="input-setting-log-bot-token"
                  type={showLogToken ? "text" : "password"}
                  placeholder="e.g. 7123456789:AAHxxxx-xxxx (ទុកទទេបើប្រើ Bot #1 ឬ #2)"
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                  title={showLogToken ? "Hide token" : "Show token"}
                >
                  {showLogToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Telegram Log Chat ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-setting-log-chatid" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Telegram Chat ID / Group ID ថ្មី (សម្រាប់ Logs តែម្ដង)
                </label>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                  Dedicated Log Channel / Group
                </span>
              </div>
              <div className="space-y-2">
                <input
                  id="input-setting-log-chatid"
                  type="text"
                  placeholder="e.g., -100123456789 (Group/Channel ID សម្រាប់ Log)"
                  value={telegramLogChatId}
                  onChange={(e) => {
                    setTelegramLogChatId(e.target.value);
                    setTgLogTestStatus(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleAutoDetectLogChatId}
                    disabled={isDetectingLogChatId || (!telegramLogBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                    title="ទាញយក Chat ID ស្វ័យប្រវត្តិពី Telegram"
                    className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {isDetectingLogChatId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Auto-Detect</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestLogTelegram}
                    disabled={isTestingLogTg || (!telegramLogBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramLogChatId.trim()}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                  >
                    {isTestingLogTg ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Alert</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Telegram Test Status Alert #3 */}
            {tgLogTestStatus && (
              <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                tgLogTestStatus.ok 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}>
                {tgLogTestStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />}
                <span className="whitespace-pre-line">{tgLogTestStatus.msg}</span>
              </div>
            )}
          </div>

          {/* Sub-Card: Bot #4 Bank Slip & AWBN Transaction Alert */}
          <div className="p-4 rounded-xl border border-cyan-200/80 dark:border-cyan-900/50 bg-cyan-50/40 dark:bg-cyan-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-950 dark:text-cyan-200 flex items-center gap-1.5 text-xs">
                <Camera className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>TELEGRAM BOT #4 (BANK SLIP & AWBN ALERT)</span>
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={telegramSlipAlertsEnabled}
                  onChange={(e) => setTelegramSlipAlertsEnabled(e.target.checked)}
                  className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-cyan-900 dark:text-cyan-300">
                  {telegramSlipAlertsEnabled ? 'បើកដំណើរការ' : 'បិទ'}
                </span>
              </label>
            </div>

            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
              ផ្ញើជូនដំណឹងភ្លាមៗជាមួយរូបភាពបង្កាន់ដៃធនាគារ (Bank Transaction Slip) និងលេខកូដ AWBN ចូលទៅកាន់ Group ឬ Channel ដាច់ដោយឡែក។
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Slip Bot Token (HTTP API) <span className="text-[10px] text-slate-400 font-normal">(ទុកទទេបើប្រើ Bot ដូចខាងលើ)</span>
              </label>
              <div className="relative">
                <input
                  type={showSlipToken ? "text" : "password"}
                  placeholder="e.g. 8859388289:AAHzv7... (Bot Token ថ្មីដាច់ដោយឡែក)"
                  value={telegramSlipBotToken}
                  onChange={(e) => {
                    setTelegramSlipBotToken(e.target.value);
                    setTgSlipTestStatus(null);
                  }}
                  className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600"
                />
                <button
                  type="button"
                  onClick={() => setShowSlipToken(!showSlipToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showSlipToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Telegram Chat ID / Group ID ថ្មី (សម្រាប់ Bank Slip)
                </label>
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">
                  Dedicated Slip Group / Channel
                </span>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="e.g., -100123456789 (Group ID សម្រាប់ទទួល Slip)"
                  value={telegramSlipChatId}
                  onChange={(e) => {
                    setTelegramSlipChatId(e.target.value);
                    setTgSlipTestStatus(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600 shadow-2xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleAutoDetectSlipChatId}
                    disabled={isDetectingSlipChatId || (!telegramSlipBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 border border-cyan-300 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    {isDetectingSlipChatId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Auto-Detect</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestSlipTelegram}
                    disabled={isTestingSlipTg || (!telegramSlipBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramSlipChatId.trim()}
                    className="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                  >
                    {isTestingSlipTg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Test Alert</span>
                  </button>
                </div>
              </div>
            </div>

            {tgSlipTestStatus && (
              <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                tgSlipTestStatus.ok 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}>
                {tgSlipTestStatus.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />}
                <span className="whitespace-pre-line">{tgSlipTestStatus.msg}</span>
              </div>
            )}
          </div>

          {/* Google Gemini AI Vision (Bank Slip OCR & Verification) */}
          <div className="p-3.5 rounded-xl border border-purple-200/80 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-950 dark:text-purple-200 flex items-center gap-1.5 text-xs">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>GOOGLE GEMINI AI VISION (BANK SLIP OCR)</span>
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 font-semibold"
              >
                <span>Get Free Key</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
              ស្កេនអានចំនួនទឹកប្រាក់ និងរូបិយប័ណ្ណ (៛ KHR / $ USD) ពីបង្កាន់ដៃធនាគារដោយស្វ័យប្រវត្តិ (ABA, Wing, ACLEDA, Canadia...) និងផ្ទៀងផ្ទាត់ជាមួយចំនួនទឹកប្រាក់ក្នុងបញ្ជី។
            </p>

            <div>
              <label htmlFor="input-setting-gemini-key" className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Gemini API Key
              </label>
              <div className="relative">
                <input
                  id="input-setting-gemini-key"
                  type={showGeminiKey ? "text" : "password"}
                  placeholder="e.g. AIzaSy..."
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Local PostgreSQL Backup Section */}
          <div className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-950 dark:text-blue-200 flex items-center gap-2 text-xs">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>LOCAL POSTGRESQL BACKUP (ប្រព័ន្ធរក្សាទុកទិន្នន័យលើម៉ាស៊ីនផ្ទាល់)</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Active / Ready</span>
              </span>
            </div>

            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
              រក្សាទុកច្បាប់ចម្លងទិន្នន័យ (Offline Copy) នៃគ្រប់កញ្ចប់ប្រាក់ (Batches, Medicine Data_BM, Permissions, Audit Logs) ចូលក្នុង PostgreSQL នៅលើម៉ាស៊ីនកុំព្យូទ័រនេះ។
            </p>

            {/* Connection & Auto-Backup Meta Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-blue-100 dark:border-blue-900/40">
                <Server className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Database Target</div>
                  <div className="font-mono font-bold text-slate-700 dark:text-slate-300">localhost:5432/ialsystems_backup</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-blue-100 dark:border-blue-900/40">
                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">Auto-Schedule</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">រៀងរាល់ ១ ម៉ោងម្តង (Windows Task)</div>
                </div>
              </div>
            </div>

            {/* Manual Trigger Backup Button & Last Sync */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {pgBackupStatus?.time ? (
                  <span>Backup ចុងក្រោយ: <strong className="text-slate-700 dark:text-slate-200 font-mono">{pgBackupStatus.time}</strong></span>
                ) : (
                  <span>មិនទាន់មានទិន្នន័យ Backup ក្នុង Session នេះនៅឡើយ</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleTriggerPgBackup}
                disabled={isBackingUpPg}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              >
                {isBackingUpPg ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>កំពុងទាញទិន្នន័យពី Firebase...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Backup ទៅ PostgreSQL ឥឡូវនេះ</span>
                  </>
                )}
              </button>
            </div>

            {/* Status Feedback Message */}
            {pgBackupStatus && (
              <div className={`p-2.5 rounded-xl flex items-start gap-2 text-[11px] ${
                pgBackupStatus.ok 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}>
                {pgBackupStatus.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                )}
                <span className="whitespace-pre-line leading-relaxed">{pgBackupStatus.msg}</span>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-950/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl font-bold bg-[#0d1b3e] hover:bg-[#152a5e] border-b-2 border-red-600 text-white shadow-sm transition"
          >
            Save Changes
          </button>
        </div>

      </div>
    </div>
  );
};
