import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Receipt,
  Camera,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Search,
  Filter,
  Send,
  Eye,
  RefreshCw,
  FileText,
  X,
  Building2,
  DollarSign,
  Calendar,
  Lock,
  Globe,
  Loader2,
  Smartphone,
  Info,
  ChevronDown,
  Tag,
  User,
  ArrowRight,
  Sparkles,
  Key,
  UserCheck
} from 'lucide-react';
import { BankSlipRecord, AppSettings, AuthUser, UserPermission } from '../types';
import { compressImageToWebP } from '../utils/compression';
import {
  getStoredBankSlips,
  saveBankSlipsToStorage,
  subscribeToBankSlips,
  saveBankSlipToFirestore,
  deleteBankSlipFromFirestore,
  uploadBankSlipToGoogle,
  sendBankSlipTelegramAlert,
  canUserViewAllRecords,
  filterBankSlipsByUser
} from '../services/bankSlipService';
import { isMasterAdmin, resolveOperator } from '../services/userPermissionService';
import {
  getPendingBMAwbnList,
  fetchLiveBMData,
  PendingBMAwbnOption
} from '../services/dataBMService';
import {
  extractBankSlipDataWithGemini,
  getGeminiApiKey,
  saveGeminiApiKey,
  SlipOcrResult
} from '../services/geminiOcrService';

interface BankSlipsPageProps {
  currentUser: AuthUser | null;
  permissions?: UserPermission[];
  settings: AppSettings;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const COMMON_BANKS = [
  { id: 'ABA', name: 'ABA Bank', color: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800' },
  { id: 'WING', name: 'Wing Bank', color: 'bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800' },
  { id: 'ACLEDA', name: 'ACLEDA', color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  { id: 'CANADIA', name: 'Canadia', color: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' },
  { id: 'TRUEMONEY', name: 'TrueMoney', color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { id: 'OTHER', name: 'ផ្សេងៗ (Other)', color: 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800' }
];

export const BankSlipsPage: React.FC<BankSlipsPageProps> = ({
  currentUser,
  permissions = [],
  settings,
  onShowToast
}) => {
  // Check if current user has unrestricted view access (Admin or not restricted)
  const hasFullAccess = canUserViewAllRecords(currentUser, permissions);
  const isAccountantManager = currentUser?.role === 'ACCOUNTANT_MANAGER' || currentUser?.role === 'ADMIN' || isMasterAdmin(currentUser?.email);
  const operatorInfo = resolveOperator(currentUser, permissions);

  // Slips state
  const [allSlips, setAllSlips] = useState<BankSlipRecord[]>(() => getStoredBankSlips());
  const [viewScope, setViewScope] = useState<'ALL' | 'MINE'>(hasFullAccess ? 'ALL' : 'MINE');
  const [slipToDelete, setSlipToDelete] = useState<BankSlipRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [awbn, setAwbn] = useState('');
  const [category, setCategory] = useState<'Buymed' | 'Borey'>('Buymed'); // Default Buymed
  const [receiverName, setReceiverName] = useState('');
  
  // Pending BM AWBN Combobox / Searchable Dropdown state
  const [bmOptions, setBmOptions] = useState<PendingBMAwbnOption[]>(() => getPendingBMAwbnList());
  const [isBmDropdownOpen, setIsBmDropdownOpen] = useState(false);
  const [isRefreshingBm, setIsRefreshingBm] = useState(false);
  const [bmSearchText, setBmSearchText] = useState('');
  const [selectedBmDetail, setSelectedBmDetail] = useState<PendingBMAwbnOption | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Image upload states
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageStats, setImageStats] = useState<{ origKB: number; compKB: number } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string>('');

  // Gemini AI Slip OCR & Verification state
  const [geminiKey, setGeminiKey] = useState<string>(() => getGeminiApiKey(settings.geminiApiKey));
  const [isVerifyingSlip, setIsVerifyingSlip] = useState(false);
  const [slipOcrResult, setSlipOcrResult] = useState<SlipOcrResult | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKeyInput, setTempApiKeyInput] = useState('');

  // Sync Gemini API key when settings change
  useEffect(() => {
    const k = getGeminiApiKey(settings.geminiApiKey);
    if (k && k !== geminiKey) {
      setGeminiKey(k);
    }
  }, [settings.geminiApiKey]);

  // Table filters & search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'ALL' | 'Buymed' | 'Borey'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [copiedAwbn, setCopiedAwbn] = useState<string | null>(null);

  // Full Image Modal
  const [previewModalSlip, setPreviewModalSlip] = useState<BankSlipRecord | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Form reference for quick scroll
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to real-time changes in Firestore
  useEffect(() => {
    const unsubscribe = subscribeToBankSlips((slips) => {
      setAllSlips(slips);
      saveBankSlipsToStorage(slips);
    });
    return () => unsubscribe();
  }, []);

  // Update viewScope if user permission changes
  useEffect(() => {
    if (!hasFullAccess) {
      setViewScope('MINE');
    }
  }, [hasFullAccess]);

  // Load / Sync Pending BM AWBN list on mount if empty
  useEffect(() => {
    if (bmOptions.length === 0) {
      fetchLiveBMData(settings.dataBmSheetUrl, settings.dataBmSheetName)
        .then(() => {
          setBmOptions(getPendingBMAwbnList());
        })
        .catch(() => {});
    }
  }, [settings.dataBmSheetUrl, settings.dataBmSheetName]);

  // Handle outside click to close AWBN dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsBmDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Re-fetch Pending BM on demand
  const handleRefreshPendingBM = async () => {
    setIsRefreshingBm(true);
    try {
      const res = await fetchLiveBMData(settings.dataBmSheetUrl, settings.dataBmSheetName);
      const list = getPendingBMAwbnList();
      setBmOptions(list);
      onShowToast(`បានទាញទិន្នន័យពី Pending BM បានចំនួន ${list.length} AWBN!`, 'success');
    } catch (e) {
      onShowToast('មិនអាចទាញទិន្នន័យពី Pending BM បានទេ', 'error');
    } finally {
      setIsRefreshingBm(false);
    }
  };

  // Filtered BM options for dropdown
  const filteredBmOptions = useMemo(() => {
    const q = (bmSearchText || awbn).trim().toLowerCase();
    if (!q) return bmOptions.slice(0, 100);
    return bmOptions.filter(opt => {
      return (
        opt.awbn.toLowerCase().includes(q) ||
        opt.receiver.toLowerCase().includes(q) ||
        opt.handleBy.toLowerCase().includes(q) ||
        opt.dest.toLowerCase().includes(q)
      );
    }).slice(0, 100);
  }, [bmOptions, bmSearchText, awbn]);

  // Select an AWBN option from Pending BM dropdown
  const handleSelectBmAwbn = (opt: PendingBMAwbnOption) => {
    setAwbn(opt.awbn);
    setSelectedBmDetail(opt);
    setIsBmDropdownOpen(false);
    onShowToast(`បានជ្រើសរើស AWBN: ${opt.awbn}`, 'info');
  };

  // Handle Image File selection & compression
  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onShowToast('សូមជ្រើសរើសឯកសារជារូបភាព (JPG, PNG, WebP)!', 'error');
      return;
    }

    setIsCompressing(true);
    try {
      const origKB = Math.round(file.size / 1024);
      // Compress to WebP for fast upload & crisp rendering
      const result = await compressImageToWebP(file, 1600, 0.85);
      setImageFile(file);
      setImageBase64(result.dataUrl);
      setImagePreview(result.dataUrl);
      setImageStats({
        origKB,
        compKB: result.compressedSizeKB
      });
      onShowToast(`បានបង្រួមរូបភាព: ${origKB}KB មកត្រឹម ${result.compressedSizeKB}KB (${result.savingsPercentage}% តូចជាងមុន)`, 'info');
      // Trigger Gemini AI OCR Verification
      triggerGeminiOcr(result.dataUrl);
    } catch (err: any) {
      console.error('Image compression failed:', err);
      // Fallback: read directly as DataURL
      const reader = new FileReader();
      reader.onload = () => {
        const dUrl = reader.result as string;
        setImageFile(file);
        setImageBase64(dUrl);
        setImagePreview(dUrl);
        setImageStats(null);
        triggerGeminiOcr(dUrl);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsCompressing(false);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImageBase64(null);
    setImagePreview(null);
    setImageStats(null);
    setSlipOcrResult(null);
    setIsVerifyingSlip(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // Trigger Gemini AI OCR verification on image
  const triggerGeminiOcr = async (dUrl: string, overrideKey?: string) => {
    const keyToUse = overrideKey || geminiKey;
    if (!keyToUse || !keyToUse.trim()) {
      return;
    }

    setIsVerifyingSlip(true);
    setSlipOcrResult(null);
    try {
      const res = await extractBankSlipDataWithGemini(dUrl, keyToUse);
      setSlipOcrResult(res);
      if (res.success) {
        if (res.receiverName) {
          setReceiverName(res.receiverName);
        }
        const recInfo = res.receiverName ? ` (គណនីទទួល: ${res.receiverName})` : '';
        onShowToast(`Gemini AI បានស្កេន Slip រួចរាល់${recInfo}`, 'success');
      } else if (res.error) {
        console.warn('Gemini OCR warning:', res.error);
      }
    } catch (e) {
      console.error('Gemini OCR error:', e);
    } finally {
      setIsVerifyingSlip(false);
    }
  };

  // Global Paste listener (Ctrl+V) for image clipboard
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleImageSelect(file);
            onShowToast('បានបិទភ្ជាប់ (Paste) រូបភាពពី Clipboard រួចរាល់!', 'success');
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // Handle Paste button click from clipboard
  const handlePasteButtonClick = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        let found = false;
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const ext = imageType.split('/')[1] || 'png';
            const file = new File([blob], `slip-clipboard-${Date.now()}.${ext}`, { type: imageType });
            await handleImageSelect(file);
            onShowToast('បានបិទភ្ជាប់ (Paste) រូបភាពពី Clipboard រួចរាល់!', 'success');
            found = true;
            break;
          }
        }
        if (!found) {
          onShowToast('មិនមានរូបភាពក្នុង Clipboard ទេ! សូម Copy រូបភាពជាមុនសិន ឬចុច Ctrl+V', 'error');
        }
      } else {
        onShowToast('សូមចុចបញ្ជា Ctrl + V នៅលើ Keyboard ដើម្បី Paste រូបភាព!', 'info');
      }
    } catch (err: any) {
      onShowToast('សូមចុចបញ្ជា Ctrl + V នៅលើ Keyboard ដើម្បី Paste រូបភាព', 'info');
    }
  };

    // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanAwbn = awbn.trim().toUpperCase();
    if (!cleanAwbn) {
      onShowToast('សូមបញ្ចូល ឬជ្រើសរើសលេខកូដ AWBN!', 'error');
      return;
    }

    if (!imageBase64) {
      onShowToast('សូមជ្រើសរើស ឬថតរូបភាពបង្កាន់ដៃធនាគារ (Bank Slip)!', 'error');
      return;
    }

    if (isVerifyingSlip) {
      onShowToast('Gemini AI កំពុងស្កេនរូបភាព សូមរង់ចាំបន្តិច...', 'info');
      return;
    }

    setIsSubmitting(true);
    setSubmitProgress('កំពុងរក្សាទុកក្នុងប្រព័ន្ធ...');

    const newId = `slip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const newSlip: BankSlipRecord = {
      id: newId,
      awbn: cleanAwbn,
      category: category, // 'Buymed' | 'Borey'
      amount: slipOcrResult?.amount || undefined,
      currency: slipOcrResult?.currency || 'USD',
      bankName: slipOcrResult?.bankName || 'Other',
      receiverName: receiverName.trim() || slipOcrResult?.receiverName || undefined,
      imageBase64: imageBase64,
      imageName: `slip_${cleanAwbn}_${Date.now()}.webp`,
      operator: operatorInfo.name,
      operatorEmail: operatorInfo.email,
      createdAt: nowIso,
      telegramSent: false,
      syncedToGoogle: false
    };

    // 1. Optimistic Local Save
    const updated = [newSlip, ...allSlips];
    setAllSlips(updated);
    saveBankSlipsToStorage(updated);

    // 2. Upload to Google Drive & Google Sheets
    setSubmitProgress('កំពុងរក្សាទុកទៅ Google Sheets & Google Drive...');
    let driveUrl: string | undefined = undefined;
    let driveFileId: string | undefined = undefined;
    let syncedToGoogle = false;

    if (settings.webAppUrl?.trim()) {
      const gRes = await uploadBankSlipToGoogle({
        slip: newSlip,
        imageBase64: imageBase64,
        webAppUrl: settings.webAppUrl,
        driveFolderId: settings.driveFolderId
      });
      if (gRes.success) {
        driveUrl = gRes.driveUrl;
        driveFileId = gRes.fileId;
        syncedToGoogle = true;
      }
    }

    // 3. Dispatch Telegram Photo to Bot #4
    setSubmitProgress('កំពុងផ្ញើរូបភាពទៅកាន់ Telegram Bot #4...');
    let telegramSent = false;
    const slipForTelegram: BankSlipRecord = {
      ...newSlip,
      driveViewUrl: driveUrl,
      driveFileId: driveFileId
    };

    const tgRes = await sendBankSlipTelegramAlert(slipForTelegram, imageBase64, settings);
    if (tgRes.success) {
      telegramSent = true;
    } else {
      console.warn('Telegram send warning:', tgRes.message);
    }

    // 4. Update slip with Google and Telegram results
    const finalizedSlip: BankSlipRecord = {
      ...newSlip,
      driveViewUrl: driveUrl,
      driveFileId: driveFileId,
      syncedToGoogle,
      telegramSent
    };

    const finalizedList = updated.map(s => s.id === newId ? finalizedSlip : s);
    setAllSlips(finalizedList);
    saveBankSlipsToStorage(finalizedList);

    // 5. Persist to Firestore
    saveBankSlipToFirestore(finalizedSlip).catch(err => console.warn('Firestore save warning:', err));

    // Reset Form
    setAwbn('');
    setCategory('Buymed');
    setReceiverName('');
    setSelectedBmDetail(null);
    clearImage();
    setIsSubmitting(false);
    setSubmitProgress('');

    const statusMsg = telegramSent
      ? `បានរក្សាទុក [${category}] AWBN ${cleanAwbn} និងផ្ញើទៅ Telegram Bot #4 ជោគជ័យ!`
      : `បានរក្សាទុក [${category}] AWBN ${cleanAwbn} រួចរាល់ (Telegram: មិនទាន់ផ្ញើ)!`;
    onShowToast(statusMsg, telegramSent ? 'success' : 'info');
  };

  // Re-send to Telegram
  const handleResendTelegram = async (slip: BankSlipRecord) => {
    if (!settings.telegramSlipBotToken?.trim() || !settings.telegramSlipChatId?.trim()) {
      onShowToast('សូមកំណត់ Bot Token និង Chat ID សម្រាប់ Bot #4 ក្នុង Settings ជាមុនសិន!', 'error');
      return;
    }

    const photoToSend = slip.imageBase64 || slip.imageUrl || slip.driveViewUrl;
    if (!photoToSend) {
      onShowToast('មិនមានរូបភាពដើម្បីផ្ញើទេ!', 'error');
      return;
    }

    setResendingId(slip.id);
    try {
      const res = await sendBankSlipTelegramAlert(slip, photoToSend, settings);
      if (res.success) {
        const updated = allSlips.map(s => s.id === slip.id ? { ...s, telegramSent: true } : s);
        setAllSlips(updated);
        saveBankSlipsToStorage(updated);
        saveBankSlipToFirestore({ ...slip, telegramSent: true }).catch(() => {});
        onShowToast(`បានផ្ញើបង្កាន់ដៃ ${slip.awbn} ទៅកាន់ Telegram រួចរាល់!`, 'success');
      } else {
        onShowToast(`បរាជ័យក្នុងការផ្ញើទៅ Telegram: ${res.message || 'Error'}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`កំហុស Telegram: ${err?.message || 'Error'}`, 'error');
    } finally {
      setResendingId(null);
    }
  };

  // Sync / Upload Slip to Google Drive & Google Sheets
  const handleSyncToGoogle = async (slip: BankSlipRecord) => {
    if (!settings.webAppUrl?.trim()) {
      onShowToast('សូមភ្ជាប់ Google Sheets Web App URL ក្នុង Settings ជាមុនសិន!', 'error');
      return;
    }
    const photoToUpload = slip.imageBase64 || slip.imageUrl;
    if (!photoToUpload) {
      onShowToast('មិនមានរូបភាពដើម្បី Upload ទេ!', 'error');
      return;
    }

    setSyncingId(slip.id);
    try {
      const res = await uploadBankSlipToGoogle({
        slip,
        imageBase64: photoToUpload,
        webAppUrl: settings.webAppUrl,
        driveFolderId: settings.driveFolderId
      });
      if (res.success) {
        const updated = allSlips.map(s => s.id === slip.id ? {
          ...s,
          driveViewUrl: res.driveUrl,
          driveFileId: res.fileId,
          syncedToGoogle: true
        } : s);
        setAllSlips(updated);
        saveBankSlipsToStorage(updated);
        saveBankSlipToFirestore({
          ...slip,
          driveViewUrl: res.driveUrl,
          driveFileId: res.fileId,
          syncedToGoogle: true
        }).catch(() => {});
        onShowToast(`បាន Upload ទៅ Google Drive & Sheets ជោគជ័យ!`, 'success');
      } else {
        onShowToast(`មិនអាច Sync ទៅ Google បានទេ៖ ${res.error || 'Error'} (សូមប្រាកដថាបាន Deploy Apps Script Version ថ្មី)`, 'error');
      }
    } catch (e: any) {
      onShowToast(`កំហុស Google Sync: ${e?.message || 'Error'}`, 'error');
    } finally {
      setSyncingId(null);
    }
  };

  // Verify slip (Accountant (manager) only)
  const handleVerifySlip = async (slip: BankSlipRecord) => {
    if (!isAccountantManager) {
      onShowToast('សិទ្ធិនេះប្រើបានតែ Accountant (manager) ប៉ុណ្ណោះ!', 'error');
      return;
    }

    const nextVerified = !slip.isVerified;
    const updatedSlip: BankSlipRecord = {
      ...slip,
      isVerified: nextVerified,
      verifiedBy: nextVerified ? (operatorInfo.name || currentUser?.name || 'Accountant (manager)') : undefined,
      verifiedAt: nextVerified ? new Date().toISOString() : undefined
    };

    const updated = allSlips.map(s => s.id === slip.id ? updatedSlip : s);
    setAllSlips(updated);
    saveBankSlipsToStorage(updated);
    saveBankSlipToFirestore(updatedSlip).catch(() => {});

    if (previewModalSlip && previewModalSlip.id === slip.id) {
      setPreviewModalSlip(updatedSlip);
    }

    onShowToast(
      nextVerified 
        ? `✓ បានផ្ទៀងផ្ទាត់ AWBN ${slip.awbn} ថា (ត្រឹមត្រូវ) រួចរាល់!`
        : `បានដកការផ្ទៀងផ្ទាត់ AWBN ${slip.awbn} រួចរាល់`,
      'success'
    );
  };

  // Open delete confirmation modal
  const handleDeleteSlip = (slip: BankSlipRecord) => {
    const isOwner = slip.operatorEmail?.toLowerCase().trim() === currentUser?.email?.toLowerCase().trim();
    const canDelete = hasFullAccess || isOwner || isAccountantManager || currentUser?.role === 'ADMIN';
    if (!canDelete) {
      onShowToast('លោកអ្នកអាចលុបបានតែបង្កាន់ដៃដែលខ្លួនឯងបានបញ្ចូលប៉ុណ្ណោះ!', 'error');
      return;
    }
    setSlipToDelete(slip);
  };

  // Confirm delete from modal
  const confirmDeleteSlip = async () => {
    if (!slipToDelete) return;
    setIsDeleting(true);
    try {
      const idToDelete = slipToDelete.id;
      const awbnDeleted = slipToDelete.awbn;
      const updated = allSlips.filter(s => s.id !== idToDelete);
      setAllSlips(updated);
      saveBankSlipsToStorage(updated);
      await deleteBankSlipFromFirestore(idToDelete);
      onShowToast(`✓ បានលុបបង្កាន់ដៃ ${awbnDeleted} ជោគជ័យ!`, 'info');
      setSlipToDelete(null);
      if (previewModalSlip && previewModalSlip.id === idToDelete) {
        setPreviewModalSlip(null);
      }
    } catch (err: any) {
      onShowToast(`កំហុសក្នុងការលុប៖ ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy AWBN
  const handleCopyAwbn = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAwbn(text);
    setTimeout(() => setCopiedAwbn(null), 2000);
    onShowToast(`បានចម្លង AWBN: ${text}`, 'info');
  };

  // Scoped slips based on permissions and tab selection
  const scopedSlips = useMemo(() => {
    if (!hasFullAccess || viewScope === 'MINE') {
      const myEmail = (currentUser?.email || '').toLowerCase().trim();
      return allSlips.filter(s => (s.operatorEmail || '').toLowerCase().trim() === myEmail);
    }
    return allSlips;
  }, [allSlips, hasFullAccess, viewScope, currentUser]);

  // Filtered slips based on search, category filter, date filter
  const filteredSlips = useMemo(() => {
    return scopedSlips.filter(slip => {
      const q = searchTerm.toLowerCase().trim();
      const matchSearch = !q ||
        slip.awbn.toLowerCase().includes(q) ||
        (slip.receiverName && slip.receiverName.toLowerCase().includes(q)) ||
        (slip.operator && slip.operator.toLowerCase().includes(q)) ||
        (slip.operatorEmail && slip.operatorEmail.toLowerCase().includes(q)) ||
        (slip.category && slip.category.toLowerCase().includes(q));

      if (!matchSearch) return false;

      // Category filter
      if (selectedCategoryFilter !== 'ALL') {
        const cat = slip.category || 'Buymed';
        if (cat !== selectedCategoryFilter) return false;
      }

      // Date filter
      if (dateFilter !== 'ALL') {
        const slipDate = new Date(slip.createdAt);
        const now = new Date();
        if (isNaN(slipDate.getTime())) return true;

        if (dateFilter === 'TODAY') {
          return slipDate.toDateString() === now.toDateString();
        }
        if (dateFilter === 'WEEK') {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(now.getDate() - 7);
          return slipDate >= oneWeekAgo;
        }
        if (dateFilter === 'MONTH') {
          return slipDate.getMonth() === now.getMonth() && slipDate.getFullYear() === now.getFullYear();
        }
      }

      return true;
    });
  }, [scopedSlips, searchTerm, selectedCategoryFilter, dateFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ========================================================================= */}
      {/* 🌟 HEADER & ACTION CONTROLS */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans tracking-tight">
                  បង្កាន់ដៃធនាគារ (Bank Slips & AWBN)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                  Bot #4
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                បញ្ចូលរូបភាព Slip ភ្ជាប់ជាមួយលេខ AWBN រក្សាទុកលើ Drive/Sheets និងផ្ញើទៅ Telegram Bot #4 ដោយស្វ័យប្រវត្តិ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Permission Scope Notice / Switcher */}
            {hasFullAccess ? (
              <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setViewScope('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    viewScope === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>ទិន្នន័យទាំងអស់ ({allSlips.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope('MINE')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    viewScope === 'MINE'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>របស់ខ្ញុំប៉ុណ្ណោះ</span>
                </button>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>សិទ្ធិ៖ មើលតែទិន្នន័យផ្ទាល់ខ្លួន</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-sm flex items-center gap-2 cursor-pointer transition active:scale-95"
            >
              <Camera className="w-4 h-4" />
              <span>+ បញ្ចូល Slip ថ្មី</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📸 FORM: UPLOAD BANK SLIP & AWBN */}
      {/* ========================================================================= */}
      <div
        ref={formRef}
        className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden mb-4"
      >
        {/* Compact Header */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-cyan-500/10 via-blue-500/5 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              <Camera className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                បញ្ចូលទិន្នន័យ Bank Transaction & AWBN
              </h2>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
            <span>អ្នកបញ្ចូល៖</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">{operatorInfo.name}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3.5 items-start">
            
            {/* Left Column: Category, AWBN, Bank, Amount, Note */}
            <div className="space-y-2">

              {/* 1. Category Selector: Compact Segmented Pill Row */}
              <div className="flex items-center justify-between gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 pl-1.5 shrink-0">
                  <Tag className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>គម្រោង៖</span>
                </span>
                <div className="grid grid-cols-2 gap-1 flex-1 max-w-[220px]">
                  <button
                    type="button"
                    onClick={() => setCategory('Buymed')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      category === 'Buymed'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${category === 'Buymed' ? 'bg-white' : 'bg-purple-400'}`} />
                    <span>Buymed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCategory('Borey')}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      category === 'Borey'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${category === 'Borey' ? 'bg-white' : 'bg-amber-400'}`} />
                    <span>Borey</span>
                  </button>
                </div>
              </div>

              {/* 2. AWBN Input with Searchable Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>លេខកូដ AWBN <span className="text-red-500">*</span></span>
                  </span>
                  <button
                    type="button"
                    onClick={handleRefreshPendingBM}
                    disabled={isRefreshingBm}
                    className="text-[10.5px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                    title="ទាញទិន្នន័យពី Pending BM ឡើងវិញ"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingBm ? 'animate-spin' : ''}`} />
                    <span>{isRefreshingBm ? 'កំពុងទាញ...' : `Pending BM (${bmOptions.length})`}</span>
                  </button>
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={awbn}
                    onFocus={() => setIsBmDropdownOpen(true)}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setAwbn(val);
                      setBmSearchText(val);
                      setIsBmDropdownOpen(true);
                      setSelectedBmDetail(null);
                    }}
                    placeholder="វាយស្វែងរក ឬរើសពីបញ្ជី Pending BM..."
                    className="w-full pl-9 pr-16 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono font-bold text-xs tracking-wider focus:ring-2 focus:ring-blue-500 focus:border-transparent transition uppercase"
                  />
                  <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center gap-0.5">
                    {awbn && (
                      <button
                        type="button"
                        onClick={() => {
                          setAwbn('');
                          setBmSearchText('');
                          setSelectedBmDetail(null);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md cursor-pointer"
                        title="លុបអក្សរ"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsBmDropdownOpen(!isBmDropdownOpen)}
                      className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition"
                      title="បើក/បិទ បញ្ជីជ្រើសរើស"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isBmDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Selected BM Matched Info Badge */}
                {selectedBmDetail && (
                  <div className="mt-1 p-1.5 px-2 rounded-lg bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-[10.5px] text-blue-900 dark:text-blue-200 flex items-center justify-between animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <div className="truncate">
                        <span className="font-mono font-bold">{selectedBmDetail.awbn}</span>
                        {selectedBmDetail.receiver && <span> • {selectedBmDetail.receiver}</span>}
                        {selectedBmDetail.handleBy && <span> (Rider: {selectedBmDetail.handleBy})</span>}
                        {selectedBmDetail.dest && <span className="text-slate-500 ml-1">[{selectedBmDetail.dest}]</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Dropdown Menu */}
                {isBmDropdownOpen && (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in duration-100">
                    <div className="p-2 bg-slate-50 dark:bg-slate-800/90 text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-between sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                      <span>បញ្ជី AWBN ({filteredBmOptions.length})</span>
                      <span className="text-[9.5px] font-normal text-slate-400">ចុចដើម្បី Auto-fill</span>
                    </div>

                    {filteredBmOptions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        {bmOptions.length === 0 ? (
                          <div>
                            <p>មិនទាន់មានទិន្នន័យ Pending BM ឡើយ</p>
                            <button
                              type="button"
                              onClick={handleRefreshPendingBM}
                              className="mt-1 px-3 py-1 bg-blue-600 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                            >
                              ទាញទិន្នន័យឥឡូវនេះ
                            </button>
                          </div>
                        ) : (
                          <p>រកមិនឃើញ AWBN ណាដែលត្រូវនឹង "{awbn}" ឡើយ (អ្នកនៅតែអាចប្រើកូដនេះដោយដៃបាន)</p>
                        )}
                      </div>
                    ) : (
                      filteredBmOptions.map((opt) => (
                        <div
                          key={opt.awbn}
                          onClick={() => handleSelectBmAwbn(opt)}
                          className={`p-2 hover:bg-blue-50 dark:hover:bg-blue-950/60 cursor-pointer transition flex items-center justify-between gap-2 text-xs ${
                            awbn === opt.awbn ? 'bg-blue-50/90 dark:bg-blue-950/70 font-bold' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 text-xs">
                              <span>{opt.awbn}</span>
                              {opt.dest && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal">
                                  {opt.dest}
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {opt.receiver && <span>{opt.receiver}</span>}
                              {opt.receiver && opt.handleBy && <span> • </span>}
                              {opt.handleBy && <span>Rider: {opt.handleBy}</span>}
                            </div>
                          </div>


                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Receiver Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-blue-500" />
                    <span>ឈ្មោះគណនីទទួល (Receiver)</span>
                  </span>
                  {slipOcrResult?.receiverName && slipOcrResult.receiverName !== receiverName && (
                    <button
                      type="button"
                      onClick={() => setReceiverName(slipOcrResult.receiverName!)}
                      className="text-[10px] text-purple-600 dark:text-purple-400 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                      title="ចុចដើម្បីកំណត់ឈ្មោះគណនីតាម Slip"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>យក: {slipOcrResult.receiverName}</span>
                    </button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="ឈ្មោះគណនីទទួល (ឧ. BUYMED CAMBODIA)..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                  {receiverName && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800 pointer-events-none">
                      គណនីទទួល
                    </span>
                  )}
                </div>
              </div>

              {/* Gemini AI Live Status Bar */}
              {isVerifyingSlip && (
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[11px] font-bold flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                    <span>Gemini AI កំពុងស្កេនរូបភាព Slip...</span>
                  </div>
                </div>
              )}

              {!isVerifyingSlip && slipOcrResult && (
                <div
                  className={`p-2 sm:p-2.5 rounded-xl border text-xs transition animate-in fade-in duration-150 ${
                    slipOcrResult.success
                      ? 'bg-purple-50/70 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200'
                      : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      {slipOcrResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-[11px] sm:text-xs">
                          {slipOcrResult.success
                            ? slipOcrResult.receiverName
                              ? `បានស្កេនឃើញគណនីទទួល៖ ${slipOcrResult.receiverName}`
                              : 'បានស្កេនរូបភាពបង្កាន់ដៃរួចរាល់'
                            : slipOcrResult.error || 'Gemini AI មិនអាចអានទិន្នន័យពី Slip បានច្បាស់លាស់ឡើយ'}
                        </div>
                        {slipOcrResult.success && slipOcrResult.transactionId && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                            Txn ID: {slipOcrResult.transactionId}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => imageBase64 && triggerGeminiOcr(imageBase64)}
                      disabled={isVerifyingSlip}
                      className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10.5px] cursor-pointer shadow-xs transition flex items-center justify-center gap-1 shrink-0"
                      title="ចុចដើម្បីឱ្យ Gemini AI ស្កេនម្តងទៀត"
                    >
                      <RefreshCw className={`w-3 h-3 ${isVerifyingSlip ? 'animate-spin' : ''}`} />
                      <span>ស្កេនម្តងទៀត</span>
                    </button>
                  </div>
                </div>
              )}

              {/* If image uploaded but no Gemini API key configured */}
              {imagePreview && !geminiKey && !isVerifyingSlip && !slipOcrResult && (
                <div className="p-2 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-[10.5px] text-purple-800 dark:text-purple-300 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>ស្កេនចាប់យកឈ្មោះគណនីទទួលស្វ័យប្រវត្តិតាម Gemini AI</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTempApiKeyInput(geminiKey);
                      setShowApiKeyModal(true);
                    }}
                    className="px-2 py-0.5 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] cursor-pointer transition shrink-0 flex items-center gap-1"
                  >
                    <Key className="w-3 h-3" />
                    <span>បញ្ចូល API Key</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Image File Picker / Camera / Paste & Preview */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center justify-between pt-1.5 pb-0.5 min-h-[30px]">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 leading-relaxed overflow-visible py-0.5">
                  <Camera className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="inline-block py-0.5">រូបភាពបង្កាន់ដៃ (Bank Slip) <span className="text-red-500">*</span></span>
                </label>
                <div className="flex items-center gap-1.5">
                  {geminiKey ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTempApiKeyInput(geminiKey);
                        setShowApiKeyModal(true);
                      }}
                      className="text-[10px] text-purple-600 dark:text-purple-400 font-bold bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-200/80 dark:border-purple-800/80 hover:bg-purple-100 flex items-center gap-1 cursor-pointer transition shadow-xs"
                      title="ចុចដើម្បីប្តូរ Gemini API Key"
                    >
                      <Sparkles className="w-3 h-3 text-purple-600" />
                      <span>Gemini AI ON</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTempApiKeyInput(geminiKey);
                        setShowApiKeyModal(true);
                      }}
                      className="text-[10px] text-purple-600 dark:text-purple-400 font-bold bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-200/80 dark:border-purple-800/80 hover:bg-purple-100 flex items-center gap-1 cursor-pointer transition shadow-xs"
                    >
                      <Key className="w-3 h-3" />
                      <span>+ Gemini Key</span>
                    </button>
                  )}
                  {imageStats && (
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                      WebP: {imageStats.compKB}KB
                    </span>
                  )}
                </div>
              </div>

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageSelect(e.target.files[0]);
                  }
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageSelect(e.target.files[0]);
                  }
                }}
              />

              {/* Dropzone & Preview Container */}
              {!imagePreview ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleImageSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  className="w-full flex flex-col items-center justify-center py-3.5 px-3 text-center rounded-2xl border-2 border-dashed border-blue-300/70 dark:border-blue-800/70 bg-gradient-to-b from-blue-50/30 via-slate-50/60 to-indigo-50/20 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-800/40 hover:border-blue-500 dark:hover:border-blue-400 transition min-h-[140px] sm:min-h-[155px]"
                >
                  {isCompressing ? (
                    <div className="flex flex-col items-center gap-2 text-blue-600 py-4">
                      <Loader2 className="w-7 h-7 animate-spin" />
                      <span className="text-xs font-bold">កំពុងបង្រួមរូបភាព WebP ស្វ័យប្រវត្តិ...</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-2xl bg-blue-100/80 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1.5 shadow-xs">
                        <UploadCloud className="w-5 h-5" />
                      </div>

                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-normal mb-1">
                        អូសទម្លាក់រូបភាពបង្កាន់ដៃ ឬ Paste ទីនេះ
                      </p>
                      
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium shadow-xs mb-2.5">
                        <span>ចុច</span>
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[9.5px] font-mono font-bold text-blue-600 dark:text-blue-400">Ctrl + V</kbd>
                        <span>ដើម្បី Paste ភ្លាមៗ</span>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs flex items-center gap-1"
                        >
                          <UploadCloud className="w-3.5 h-3.5 text-blue-500" />
                          <span>ជ្រើសរើស</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>ថតរូប</span>
                        </button>

                        <button
                          type="button"
                          onClick={handlePasteButtonClick}
                          className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1"
                          title="បិទភ្ជាប់រូបភាពពី Clipboard (Ctrl + V)"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Paste (Ctrl+V)</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center w-full">
                  {/* Snug container that wraps tightly to the image's natural dimensions */}
                  <div className="w-fit max-w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-100/90 via-slate-50 to-slate-100/80 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 p-2 shadow-sm flex flex-col items-center">
                    
                    {/* Top Bar: Slip metadata & action toolbar matching image width */}
                    <div className="w-full flex items-center justify-between gap-1.5 pb-1.5 mb-1.5 border-b border-slate-200/80 dark:border-slate-800/80">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="px-2 py-0.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                          <Receipt className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{slipOcrResult?.bankName || 'Bank Slip'}</span>
                        </div>
                        {slipOcrResult?.receiverName && (
                          <div className="hidden sm:inline-flex px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800 text-[10.5px] font-bold text-purple-700 dark:text-purple-300">
                            គណនី: {slipOcrResult.receiverName}
                          </div>
                        )}
                      </div>

                      {/* Action buttons toolbar */}
                      <div className="flex items-center gap-1 shrink-0">
                        {geminiKey && (
                          <button
                            type="button"
                            onClick={() => imageBase64 && triggerGeminiOcr(imageBase64)}
                            disabled={isVerifyingSlip}
                            className="px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10.5px] font-bold shadow-xs transition cursor-pointer flex items-center gap-1"
                            title="ស្កេនផ្ទៀងផ្ទាត់ឡើងវិញជាមួយ Gemini AI"
                          >
                            <Sparkles className={`w-3 h-3 ${isVerifyingSlip ? 'animate-spin' : ''}`} />
                            <span>ស្កេន AI</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handlePasteButtonClick}
                          className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold shadow-xs transition cursor-pointer flex items-center gap-1"
                          title="Paste រូបភាពថ្មីជំនួស (Ctrl+V)"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Paste ថ្មី</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewModalSlip({
                              id: 'preview',
                              awbn: awbn || 'PREVIEW',
                              category: category,
                              imageBase64: imagePreview,
                              operator: operatorInfo.name,
                              operatorEmail: operatorInfo.email,
                              createdAt: new Date().toISOString()
                            });
                          }}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
                          title="ពង្រីកមើលរូបភាពពេញ"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={clearImage}
                          className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition cursor-pointer shadow-xs"
                          title="ដករូបភាពចេញ"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Center: Image conforming strictly to natural dimensions */}
                    <div
                      className="relative group cursor-pointer overflow-hidden rounded-xl border border-slate-300/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-md transition-all duration-200 hover:shadow-lg hover:scale-[1.01]"
                      onClick={() => {
                        setPreviewModalSlip({
                          id: 'preview',
                          awbn: awbn || 'PREVIEW',
                          category: category,
                          imageBase64: imagePreview,
                          operator: operatorInfo.name,
                          operatorEmail: operatorInfo.email,
                          createdAt: new Date().toISOString()
                        });
                      }}
                      title="ចុចដើម្បីពង្រីកមើលរូបភាពពេញ"
                    >
                      <img
                        src={imagePreview}
                        alt="Bank Slip Preview"
                        className="max-h-[280px] sm:max-h-[320px] w-auto max-w-full object-contain block mx-auto"
                      />
                      {/* Subtle hover overlay hint */}
                      <div className="absolute inset-0 bg-slate-950/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900/85 text-white text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-xs shadow-md">
                          <Eye className="w-3.5 h-3.5 text-blue-400" />
                          <span>ពង្រីកមើល</span>
                        </span>
                      </div>
                    </div>

                    {/* Bottom Bar: Verification status & hint */}
                    <div className="w-full pt-1.5 mt-1.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-[10.5px]">
                      <div className="flex items-center gap-1.5">
                        {isVerifyingSlip ? (
                          <div className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-bold flex items-center gap-1 animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>AI កំពុងស្កេន...</span>
                          </div>
                        ) : slipOcrResult?.receiverName ? (
                          <div className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-200 font-bold flex items-center gap-1 border border-purple-300/60 dark:border-purple-800/60">
                            <UserCheck className="w-3 h-3 text-purple-600" />
                            <span>គណនី: {slipOcrResult.receiverName}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Eye className="w-3 h-3 text-slate-400" />
                            <span>ចុចលើរូបដើម្បីពង្រីកពេញអេក្រង់</span>
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-400 font-mono">
                        {imageStats ? `WebP (${imageStats.compKB}KB)` : 'Ready'}
                      </span>
                    </div>

                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Compact Submit Actions */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>
                Save ក្នុង Google Sheets, Drive និងផ្ញើទៅ Telegram Bot #4 ស្វ័យប្រវត្តិ
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="submit"
                disabled={isSubmitting || !awbn.trim() || !imageBase64 || isVerifyingSlip}
                className={`w-full sm:w-auto px-5 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 ${
                  !isSubmitting && awbn.trim() && imageBase64 && !isVerifyingSlip
                    ? 'bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25 cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-80'
                }`}
                title={
                  !awbn.trim()
                    ? 'សូមជ្រើសរើស ឬបញ្ចូល AWBN'
                    : !imageBase64
                    ? 'សូមបញ្ចូលរូបភាព Bank Slip'
                    : 'ចុចដើម្បីរក្សាទុក និងផ្ញើទៅ Telegram Bot #4'
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{submitProgress || 'កំពុងដំណើរការ...'}</span>
                  </>
                ) : isVerifyingSlip ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
                    <span>កំពុងស្កេនរូបភាព Slip...</span>
                  </>
                ) : !imageBase64 ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>🔒 សូមបញ្ចូលរូបភាព Bank Slip</span>
                  </>
                ) : !awbn.trim() ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>🔒 សូមជ្រើសរើស AWBN</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>រក្សាទុក & ផ្ញើទៅ Telegram Bot #4</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* 📋 TABLE: BANK SLIPS HISTORY & FILTERS */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Table Filter Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ស្វែងរកតាម AWBN, ប្រភេទ, គណនីទទួល, អ្នកបញ្ចូល..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category and Date Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {/* Category Filter */}
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <option value="ALL">ប្រភេទទាំងអស់ (All)</option>
                <option value="Buymed">Buymed</option>
                <option value="Borey">Borey</option>
              </select>

              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <option value="ALL">កាលបរិច្ឆេទទាំងអស់</option>
                <option value="TODAY">ថ្ងៃនេះ (Today)</option>
                <option value="WEEK">៧ ថ្ងៃចុងក្រោយ (Week)</option>
                <option value="MONTH">ខែនេះ (This Month)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Slips Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-12 text-center">រូបភាព</th>
                <th className="py-3 px-4">លេខ AWBN</th>
                <th className="py-3 px-4">ប្រភេទ</th>
                <th className="py-3 px-4">ឈ្មោះគណនីទទួល</th>
                <th className="py-3 px-4">អ្នកបញ្ចូល & ម៉ោង</th>
                <th className="py-3 px-4 text-right">សកម្មភាព</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSlips.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="font-bold text-sm text-slate-600 dark:text-slate-400">មិនមានទិន្នន័យ Bank Slip ទេ</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm || selectedCategoryFilter !== 'ALL' || dateFilter !== 'ALL'
                        ? 'មិនមានលទ្ធផលត្រូវនឹងការស្វែងរករបស់អ្នក'
                        : 'សូមបំពេញ Form ខាងលើដើម្បីបញ្ចូលបង្កាន់ដៃថ្មី'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSlips.map((slip) => {
                  const isOwner = slip.operatorEmail?.toLowerCase().trim() === currentUser?.email?.toLowerCase().trim();
                  const canDelete = hasFullAccess || isOwner || isAccountantManager || currentUser?.role === 'ADMIN';
                  
                  // Resolve direct image URL for preview and thumbnail
                  const resolvedImgUrl = slip.imageBase64 || slip.imageUrl || (slip.driveFileId ? `https://lh3.googleusercontent.com/d/${slip.driveFileId}` : (slip.driveViewUrl?.includes('/d/') ? `https://lh3.googleusercontent.com/d/${slip.driveViewUrl.split('/d/')[1].split('/')[0]}` : ''));
                  const hasPhoto = !!resolvedImgUrl;

                  return (
                    <tr
                      key={slip.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Thumbnail Photo (Clickable) */}
                      <td className="py-3 px-4 text-center">
                        <div
                          onClick={() => setPreviewModalSlip(slip)}
                          className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer hover:scale-105 hover:border-blue-500 hover:shadow-md transition-all shadow-xs inline-flex items-center justify-center relative group"
                          title="ចុចដើម្បីមើលរូបភាពធំ (Click to preview)"
                        >
                          {hasPhoto ? (
                            <img
                              src={resolvedImgUrl}
                              alt={slip.awbn}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                if (slip.driveFileId) {
                                  (e.target as HTMLImageElement).src = `https://drive.google.com/thumbnail?id=${slip.driveFileId}&sz=w200`;
                                }
                              }}
                            />
                          ) : (
                            <Receipt className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Eye className="w-3.5 h-3.5 drop-shadow-xs" />
                          </div>
                        </div>
                      </td>

                      {/* AWBN Code */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-xs">
                            {slip.awbn}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyAwbn(slip.awbn)}
                            className="p-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                            title="ចម្លង AWBN"
                          >
                            {copiedAwbn === slip.awbn ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Category Badge (Buymed vs Borey) */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${
                          slip.category === 'Borey'
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${slip.category === 'Borey' ? 'bg-amber-500' : 'bg-purple-500'}`} />
                          <span>{slip.category || 'Buymed'}</span>
                        </span>
                      </td>

                      {/* Receiver Name */}
                      <td className="py-3 px-4">
                        {slip.receiverName ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            <UserCheck className="w-3 h-3 text-purple-500 shrink-0" />
                            <span>{slip.receiverName}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Operator & Time */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-700 dark:text-slate-200">
                          {slip.operator}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>
                            {new Date(slip.createdAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {slip.telegramSent && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800" title="បានផ្ញើទៅ Telegram">
                              ✓ Telegram
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* (ត្រឹមត្រូវ) Verification Action / Badge */}
                          {slip.isVerified ? (
                            <button
                              type="button"
                              onClick={() => isAccountantManager && handleVerifySlip(slip)}
                              disabled={!isAccountantManager}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 border transition shadow-xs ${
                                isAccountantManager
                                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 cursor-pointer'
                                  : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800 cursor-default'
                              }`}
                              title={
                                slip.verifiedBy
                                  ? `ផ្ទៀងផ្ទាត់ដោយ៖ ${slip.verifiedBy} ${slip.verifiedAt ? `(${new Date(slip.verifiedAt).toLocaleDateString()})` : ''}${isAccountantManager ? ' (ចុចដើម្បីដកចេញ)' : ''}`
                                  : 'ផ្ទៀងផ្ទាត់រួចរាល់'
                              }
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>✓ ត្រឹមត្រូវ</span>
                            </button>
                          ) : isAccountantManager ? (
                            <button
                              type="button"
                              onClick={() => handleVerifySlip(slip)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 transition cursor-pointer shadow-xs"
                              title="ចុចដើម្បីបញ្ជាក់ថា (ត្រឹមត្រូវ) [សិទ្ធិ Accountant manager]"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span>(ត្រឹមត្រូវ)</span>
                            </button>
                          ) : (
                            <span
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                              title="រង់ចាំ Accountant (manager) ត្រួតពិនិត្យ"
                            >
                              មិនទាន់ផ្ទៀងផ្ទាត់
                            </span>
                          )}

                          {slip.driveViewUrl && (
                            <a
                              href={slip.driveViewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                              title="មើលលើ Google Drive"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSlip(slip)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                              title="លុបបង្កាន់ដៃ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🔍 MODAL: FULL RESOLUTION IMAGE PREVIEW */}
      {/* ========================================================================= */}
      {previewModalSlip && (() => {
        const modalImgSrc = previewModalSlip.imageBase64 || previewModalSlip.imageUrl || (previewModalSlip.driveFileId ? `https://lh3.googleusercontent.com/d/${previewModalSlip.driveFileId}` : (previewModalSlip.driveViewUrl?.includes('/d/') ? `https://lh3.googleusercontent.com/d/${previewModalSlip.driveViewUrl.split('/d/')[1].split('/')[0]}` : ''));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              
              {/* Modal Header */}
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                    AWBN: {previewModalSlip.awbn}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    previewModalSlip.category === 'Borey'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300'
                      : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-300'
                  }`}>
                    {previewModalSlip.category || 'Buymed'}
                  </span>
                  {previewModalSlip.receiverName && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center gap-1">
                      <UserCheck className="w-2.5 h-2.5" />
                      <span>ទទួល: {previewModalSlip.receiverName}</span>
                    </span>
                  )}
                  {previewModalSlip.isVerified && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>✓ ត្រឹមត្រូវ</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {previewModalSlip.driveViewUrl && (
                    <a
                      href={previewModalSlip.driveViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>បើកលើ Drive</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewModalSlip(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Image Body */}
              <div className="flex-1 overflow-auto p-4 bg-slate-950 flex items-center justify-center min-h-[300px]">
                {modalImgSrc ? (
                  <img
                    src={modalImgSrc}
                    alt={previewModalSlip.awbn}
                    className="max-h-[70vh] w-auto object-contain rounded-lg shadow-lg"
                    onError={(e) => {
                      if (previewModalSlip.driveFileId) {
                        (e.target as HTMLImageElement).src = `https://drive.google.com/thumbnail?id=${previewModalSlip.driveFileId}&sz=w800`;
                      }
                    }}
                  />
                ) : previewModalSlip.driveViewUrl ? (
                  <div className="text-center py-10 px-4">
                    <Receipt className="w-16 h-16 text-blue-400 mx-auto mb-3 opacity-60" />
                    <p className="text-sm font-bold text-white mb-1">
                      រូបភាពត្រូវបានរក្សាទុកនៅលើ Google Drive
                    </p>
                    <p className="text-xs text-slate-400 mb-4">
                      ចុចប៊ូតុងខាងក្រោមដើម្បីបើកមើលរូបភាពច្បាស់ពេញលេញ
                    </p>
                    <a
                      href={previewModalSlip.driveViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>បើកមើលរូបភាពលើ Google Drive</span>
                    </a>
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-400">
                    <Receipt className="w-12 h-12 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">មិនមានរូបភាពសម្រាប់បង្កាន់ដៃនេះទេ</p>
                  </div>
                )}
              </div>

              {/* Modal Footer Info & Actions */}
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                <div className="flex items-center gap-3">
                  <div>
                    <span>អ្នកបញ្ចូល៖ </span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{previewModalSlip.operator}</span>
                    <span className="font-mono text-slate-400"> ({previewModalSlip.operatorEmail})</span>
                  </div>
                  <div className="font-mono text-slate-400">
                    {new Date(previewModalSlip.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* Accountant manager verification toggle directly inside modal */}
                {isAccountantManager && (
                  <button
                    type="button"
                    onClick={() => handleVerifySlip(previewModalSlip)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                      previewModalSlip.isVerified
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-600 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{previewModalSlip.isVerified ? '✓ ត្រឹមត្រូវ (ចុចដើម្បីដក)' : 'បញ្ជាក់ថា (ត្រឹមត្រូវ)'}</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 🗑️ MODAL: DELETE CONFIRMATION (ធានាថាដំណើរការ 100% មិនពឹងលើ window.confirm) */}
      {/* ========================================================================= */}
      {slipToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mb-4 border border-rose-200 dark:border-rose-900">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              បញ្ជាក់ការលុបបង្កាន់ដៃធនាគារ
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              តើលោកអ្នកពិតជាចង់លុបបង្កាន់ដៃ AWBN: <strong className="text-slate-800 dark:text-slate-200 font-mono font-bold text-sm bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{slipToDelete.awbn}</strong> នេះចេញពីប្រព័ន្ធមែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់ក្រោយវិញបានឡើយ។
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-6">
              <button
                type="button"
                onClick={() => setSlipToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                onClick={confirmDeleteSlip}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? 'កំពុងលុប...' : 'លុបចេញភ្លាមៗ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini AI API Key Configuration Modal */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Google Gemini AI Vision Key
                  </h3>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    ស្កេន & ផ្ទៀងផ្ទាត់ទឹកប្រាក់លើបង្កាន់ដៃស្វ័យប្រវត្តិ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
                  💡 មុខងារ Gemini AI Vision លើ Slip៖
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>អានចំនួនទឹកប្រាក់ និងរូបិយប័ណ្ណ (៛ KHR / $ USD) ពីបង្កាន់ដៃ ABA, Wing, ACLEDA...</li>
                  <li>ផ្ទៀងផ្ទាត់ដោយស្វ័យប្រវត្តិនឹង Amount ក្នុងបញ្ជី ដើម្បីជៀសវាងការវាយខុស</li>
                  <li>ផ្តល់ជម្រើសចុចតែមួយ <code>[កែតាម Slip]</code> ប្រសិនបើខុសគ្នា</li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Gemini API Key</span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10.5px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-normal"
                  >
                    <span>យក Key ឥតគិតថ្លៃនៅ Google AI Studio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </label>
                <input
                  type="password"
                  value={tempApiKeyInput}
                  onChange={(e) => setTempApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-xs focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              </div>

              <div className="text-[10px] text-slate-400">
                ចំណាំ៖ Gemini Flash ផ្តល់ជូន Free Tier រាប់ពាន់ Request ក្នុងមួយថ្ងៃដោយឥតគិតថ្លៃពី Google។
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                {geminiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      saveGeminiApiKey('');
                      setGeminiKey('');
                      setTempApiKeyInput('');
                      setShowApiKeyModal(false);
                      onShowToast('បានលុប Gemini API Key រួចរាល់', 'info');
                    }}
                    className="text-xs text-red-500 hover:underline cursor-pointer"
                  >
                    លុប Key ចេញ
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowApiKeyModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  បោះបង់
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cleanKey = tempApiKeyInput.trim();
                    saveGeminiApiKey(cleanKey);
                    setGeminiKey(cleanKey);
                    setShowApiKeyModal(false);
                    onShowToast(cleanKey ? 'បានរក្សាទុក Gemini API Key រួចរាល់!' : 'បានលុប API Key', 'success');
                    if (cleanKey && imageBase64) {
                      triggerGeminiOcr(imageBase64, cleanKey);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>រក្សាទុក & ដំណើរការ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
