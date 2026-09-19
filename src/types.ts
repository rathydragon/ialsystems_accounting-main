export type TransactionType = 'INCOME' | 'EXPENSE';
export type CurrencyType = 'USD' | 'KHR';

export interface ReceiptItem {
  id: string;
  name: string;
  dataUrl: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  savingsPercentage: number;
  width: number;
  height: number;
  driveUrl?: string | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  amount: number;
  currency: CurrencyType;
  paymentMethod: string; // 'Cash' | 'ABA Pay' | 'Wing Bank' | 'ACLEDA Mobile' | 'Bank Transfer' | 'Other'
  personName?: string;   // ឈ្មោះអ្នកចំណាយ ឬ ឈ្មោះអ្នកចំណូល (Party / Client / Payer)
  party?: string;
  operator?: string;     // ឈ្មោះអ្នកកត់ត្រា (Logged in user)
  date: string;
  note: string;
  receiptUrl?: string | null;
  receiptBase64?: string | null;
  receiptName?: string | null;
  receipts?: ReceiptItem[];
  timestamp: string;
  syncedToGoogle?: boolean;
}

export interface CompressionResult {
  dataUrl: string;
  originalSizeKB: number;
  compressedSizeKB: number;
  savingsPercentage: number;
  width: number;
  height: number;
}

export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';

export interface UserPermission {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  lastLogin?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  role?: UserRole;
}

export interface AppSettings {
  webAppUrl: string;
  telegramBotToken?: string;
  telegramChatId: string;
  telegramPaymentBotToken?: string;
  telegramPaymentChatId?: string;
  telegramLogBotToken?: string;
  telegramLogChatId?: string;
  telegramLogAlertsEnabled?: boolean;
  spreadsheetId: string;
  driveFolderId: string;
  darkMode: boolean;
  demoMode: boolean;
  exchangeRate?: number;
  googleClientId?: string;
  allowedEmails?: string;
  adminPin?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
}

export interface SummaryStats {
  incomeUSD: number;
  expenseUSD: number;
  balanceUSD: number;
  incomeKHR: number;
  expenseKHR: number;
  balanceKHR: number;
}

export interface DatabaseRecord {
  id: string;
  barcode: string;
  payment: string;
  usd: number;
  khm: number;
  date: string;
  note?: string;
}

export interface CollectionItem {
  id: string;
  tracking: string;
  name: string;
  date: string;
  amount?: number;
  currency?: 'USD' | 'KHR';
  paymentMethod: string;
  usd?: number;
  khm?: number;
  lookupFound?: boolean;
  note?: string;
  createdAt: string;
}

export interface CollectionBatch {
  id: string;
  batchNumber: string;
  totalItems: number;
  totalUSD: number;
  totalKHR: number;
  bankUSD?: number;
  bankKHR?: number;
  cashUSD?: number;
  cashKHR?: number;
  reconciliation?: string;
  reconciliationStatus?: 'BALANCED' | 'SHORTAGE' | 'SURPLUS';
  diffUSD?: number;
  diffKHR?: number;
  operator: string;
  operatorEmail?: string;
  notes?: string;
  createdAt: string;
  items: CollectionItem[];
  syncedToGoogle?: boolean;
}

export type ActivityActionType = 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'COMMIT_BATCH' 
  | 'DELETE_BATCH' 
  | 'DELETE_ALL_BATCHES' 
  | 'RESEND_TELEGRAM' 
  | 'ADD_USER' 
  | 'UPDATE_ROLE' 
  | 'CHANGE_STATUS' 
  | 'DELETE_USER' 
  | 'SYNC_SHEETS';

export interface UserActivityLog {
  id: string;
  timestamp: string;
  operator: string;
  operatorEmail?: string;
  action: ActivityActionType;
  description: string;
  batchNumber?: string;
  targetUserEmail?: string;
  targetUserRole?: string;
  userEmail?: string;
  userName?: string;
  userRole?: UserRole;
  title?: string;
  details?: string;
  amountUSD?: number;
  amountKHR?: number;
  itemsCount?: number;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

export type PayerCategory = 'RIDER' | 'CUSTOMER' | 'BRANCH' | 'PARTNER' | 'OTHER';

export interface Payer {
  id: string;
  name: string;
  phone?: string;
  category: PayerCategory;
  area?: string;
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE';
  totalBatches?: number;
  totalUSD?: number;
  totalKHR?: number;
  createdAt: string;
  updatedAt?: string;
}

export type NavView = 'COLLECTION' | 'PAYERS' | 'DATA' | 'PERMISSIONS' | 'SETTINGS';
