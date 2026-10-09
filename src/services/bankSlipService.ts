import { BankSlipRecord, AppSettings, AuthUser, UserPermission } from '../types';
import { sendTelegramPhoto } from './telegramService';
import { isMasterAdmin, canUserViewAllData } from './userPermissionService';
import {
  subscribeToBankSlipsFromSupabase
} from './supabaseDbService';

export const STORAGE_KEY_BANK_SLIPS = 'accounting_bank_slips_v1';

/**
 * Retrieve saved bank slips from LocalStorage
 */
export function getStoredBankSlips(): BankSlipRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BANK_SLIPS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load bank slips from localStorage:', err);
  }
  return [];
}

/**
 * Persist bank slips to LocalStorage
 */
export function saveBankSlipsToStorage(slips: BankSlipRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_BANK_SLIPS, JSON.stringify(slips));
  } catch (err) {
    console.warn('Failed to save bank slips to localStorage:', err);
  }
}

/**
 * Subscribe to real-time bank slips in Supabase Realtime
 */
export function subscribeToBankSlips(
  onUpdate: (slips: BankSlipRecord[]) => void,
  _onError?: (error: any) => void
): () => void {
  return subscribeToBankSlipsFromSupabase((slips) => {
    saveBankSlipsToStorage(slips);
    onUpdate(slips);
  });
}

// Export Supabase Bank Slip functions & backwards-compatible aliases
export {
  saveBankSlipToSupabase,
  deleteBankSlipFromSupabase,
  saveBankSlipToSupabase as saveBankSlipToFirestore,
  deleteBankSlipFromSupabase as deleteBankSlipFromFirestore
} from './supabaseDbService';

/**
 * Check if the user is allowed to view all records, or restricted to their own
 */
export function canUserViewAllRecords(
  user: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  return canUserViewAllData(user, permissions);
}

/**
 * Filter bank slips according to the user's view permission scope
 */
export function filterBankSlipsByUser(
  slips: BankSlipRecord[],
  user: AuthUser | null,
  permissions?: UserPermission[]
): BankSlipRecord[] {
  if (!user) return [];
  if (canUserViewAllRecords(user, permissions)) {
    return slips;
  }
  // User is restricted to viewing only their own slips
  const myEmail = user.email.toLowerCase().trim();
  return slips.filter(slip => {
    const slipOpEmail = (slip.operatorEmail || '').toLowerCase().trim();
    return slipOpEmail === myEmail;
  });
}

/**
 * Upload slip image to Google Drive & save record to Google Sheets
 */
export async function uploadBankSlipToGoogle(params: {
  slip: BankSlipRecord;
  imageBase64?: string;
  webAppUrl?: string;
  driveFolderId?: string;
}): Promise<{ success: boolean; driveUrl?: string; fileId?: string; error?: string }> {
  const { slip, imageBase64, webAppUrl, driveFolderId } = params;
  if (!webAppUrl || !webAppUrl.trim()) {
    return { success: false, error: 'មិនទាន់ភ្ជាប់ Google Sheets Web App URL' };
  }

  try {
    const payload = {
      action: 'save_bank_slip',
      folderId: driveFolderId || '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w',
      slip: {
        id: slip.id,
        awbn: slip.awbn,
        category: slip.category || 'Buymed',
        amount: slip.amount,
        currency: slip.currency || 'USD',
        bankName: slip.bankName || '',
        receiverName: slip.receiverName || '',
        note: slip.note || '',
        operator: slip.operator,
        operatorEmail: slip.operatorEmail,
        createdAt: slip.createdAt,
        imageName: slip.imageName || `slip_${slip.awbn}_${Date.now()}.webp`,
        imageBase64: imageBase64 || slip.imageBase64 || ''
      }
    };

    const res = await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.status === 'success') {
      return {
        success: true,
        driveUrl: data.fileUrl || data.driveUrl || (data.fileId ? `https://drive.google.com/file/d/${data.fileId}/view` : undefined),
        fileId: data.fileId
      };
    } else {
      return { success: false, error: data.message || 'Failed to save to Google Sheets/Drive' };
    }
  } catch (err: any) {
    console.warn('uploadBankSlipToGoogle error:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Dispatch Telegram Alert with Photo via Bot #4
 */
export async function sendBankSlipTelegramAlert(
  slip: BankSlipRecord,
  imageBlobOrDataUrl: Blob | string,
  settings: AppSettings
): Promise<{ success: boolean; message?: string }> {
  const botToken = settings.telegramSlipBotToken?.trim();
  const chatId = settings.telegramSlipChatId?.trim();
  const isEnabled = settings.telegramSlipAlertsEnabled !== false;

  if (!isEnabled) {
    return { success: false, message: 'Telegram Slip Alerts ត្រូវបានបិទ (Disabled)' };
  }

  if (!botToken || !chatId) {
    return { success: false, message: 'មិនទាន់កំណត់ Bot Token ឬ Chat ID សម្រាប់ Bot ទី ៤ (Slip Alert)' };
  }

  // Format currency display
  let amountStr = '';
  if (slip.amount !== undefined && slip.amount !== null && !isNaN(slip.amount)) {
    if (slip.currency === 'KHR') {
      amountStr = `${slip.amount.toLocaleString()} ៛`;
    } else {
      amountStr = `$${slip.amount.toFixed(2)}`;
    }
  }

  // Format date display (e.g. 30/09/2026, 03:54 pm)
  const createdDate = new Date(slip.createdAt);
  let dateFormatted = slip.createdAt;
  if (!isNaN(createdDate.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = pad(createdDate.getDate());
    const month = pad(createdDate.getMonth() + 1);
    const year = createdDate.getFullYear();
    let hours = createdDate.getHours();
    const minutes = pad(createdDate.getMinutes());
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hourStr = pad(hours);
    dateFormatted = `${day}/${month}/${year}, ${hourStr}:${minutes} ${ampm}`;
  }

  const operatorInfo = slip.operatorEmail?.trim()
    ? `${slip.operator} (${slip.operatorEmail.trim()})`
    : slip.operator;

  // Build exact Telegram caption format specified by user:
  // - AWBN: SOCAM768652
  // - កាលបរិច្ឆេទ: 30/09/2026, 03:54 pm
  // - ប្រភេទ: Buymed
  //
  // - អ្នកបញ្ចូល: KEUN RATHY (rathykim34@gmail.com)
  // ━━━━━━━━━━━━━━━━━━━━━━
  // ✨ ប្រព័ន្ធគណនេយ្យ IAL Systems
  const lines = [
    `- AWBN: ${slip.awbn}`,
    `- កាលបរិច្ឆេទ: ${dateFormatted}`,
    `- ប្រភេទ: ${slip.category || 'Buymed'}`,
    '',
    `- អ្នកបញ្ចូល: ${operatorInfo}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    '✨ ប្រព័ន្ធគណនេយ្យ IAL Systems'
  ];

  const caption = lines.join('\n');

  try {
    const result = await sendTelegramPhoto({
      webAppUrl: settings.webAppUrl,
      botToken,
      chatId,
      photo: imageBlobOrDataUrl,
      caption,
      parseMode: 'HTML'
    });

    return result;
  } catch (err: any) {
    console.error('Error sending Telegram slip photo:', err);
    return { success: false, message: err?.message || 'Failed to send photo to Telegram' };
  }
}
