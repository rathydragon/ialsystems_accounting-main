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

export type UserRole = 
  | 'ADMIN' 
  | 'ACCOUNTANT_MANAGER' 
  | 'ACCOUNTANT' 
  | 'CS_TEAMS' 
  | 'CS_TEAMS_OPT' 
  | 'DELIVERY' 
  | 'DELIVERY_OPT' 
  | 'HUB' 
  | 'HUB_OPT' 
  | 'VIEWER'
  | 'Cs Teams'
  | 'Cs Teams(Opt)'
  | 'Delivery(Opt)'
  | 'Hub'
  | 'Hub(Opt)';

export function normalizeUserRole(role?: string | null): UserRole {
  if (!role) return 'VIEWER';
  const clean = role.trim();
  const upper = clean.toUpperCase();

  if (upper === 'ADMIN') return 'ADMIN';
  if (upper === 'ACCOUNTANT_MANAGER' || upper === 'ACCOUNTANT (MANAGER)' || upper === 'MANAGER') return 'ACCOUNTANT_MANAGER';
  if (upper === 'ACCOUNTANT') return 'ACCOUNTANT';
  if (upper === 'CS_TEAMS' || upper === 'CS TEAMS' || upper === 'CSTEAMS' || clean === 'Cs Teams') return 'CS_TEAMS';
  if (upper === 'CS_TEAMS_OPT' || upper === 'CS TEAMS(OPT)' || upper === 'CS TEAMS (OPT)' || upper === 'CSTEAMS(OPT)' || clean === 'Cs Teams(Opt)') return 'CS_TEAMS_OPT';
  if (upper === 'DELIVERY') return 'DELIVERY';
  if (upper === 'DELIVERY_OPT' || upper === 'DELIVERY(OPT)' || upper === 'DELIVERY (OPT)' || clean === 'Delivery(Opt)') return 'DELIVERY_OPT';
  if (upper === 'HUB' || clean === 'Hub') return 'HUB';
  if (upper === 'HUB_OPT' || upper === 'HUB(OPT)' || upper === 'HUB (OPT)' || clean === 'Hub(Opt)') return 'HUB_OPT';
  if (upper === 'VIEWER') return 'VIEWER';

  return clean as UserRole;
}

export interface UserPermission {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  viewOnlyOwn?: boolean; // បើ true មើលឃើញតែទិន្នន័យដែលខ្លួនឯងបានបញ្ចូល (View Own Records Only)
  canCreate?: boolean;   // សិទ្ធិបញ្ចូលទិន្នន័យថ្មី (Can Add / Create)
  canEdit?: boolean;     // សិទ្ធិកែប្រែទិន្នន័យ (Can Edit)
  canDelete?: boolean;   // សិទ្ធិលុបទិន្នន័យ (Can Delete)
  allowedPages?: NavView[]; // សិទ្ធិចូលមើលទំព័រនីមួយៗ (Page Access Rights)
  createdAt: string;
  lastLogin?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  role?: UserRole;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  allowedPages?: NavView[]; // សិទ្ធិចូលមើលទំព័រនីមួយៗ (Page Access Rights)
  loginTimestamp?: number;
  sessionExpiresAt?: number;
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
  telegramSlipBotToken?: string;
  telegramSlipChatId?: string;
  telegramSlipAlertsEnabled?: boolean;
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
  dataBmSheetUrl?: string;
  dataBmSheetName?: string;
  followupBmSheetUrl?: string;
  followupBmSheetName?: string;
  sokimexSheetUrl?: string;
  sokimexSheetName?: string;
  dataReportSheetUrl?: string;
  dataReportSheetName?: string;
  geminiApiKey?: string; // Google Gemini API Key សម្រាប់ OCR Slip & AI Verification
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
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export type ActivityActionType = 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'COMMIT_BATCH' 
  | 'COMMIT_MEDICINE_BATCH'
  | 'DELETE_BATCH' 
  | 'DELETE_MEDICINE_BATCH'
  | 'RESTORE_BATCH'
  | 'RESTORE_MEDICINE_BATCH'
  | 'DELETE_ALL_BATCHES' 
  | 'DELETE_ALL_MEDICINE_BATCHES'
  | 'RESEND_TELEGRAM' 
  | 'RESEND_MEDICINE_TELEGRAM'
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

export interface BankSlipRecord {
  id: string;
  awbn: string;                // លេខកូដ AWBN
  category?: 'Buymed' | 'Borey'; // ប្រភេទ (Buymed, Borey)
  amount?: number;             // ចំនួនទឹកប្រាក់ (optional)
  currency?: 'USD' | 'KHR';    // ប្រភេទទឹកប្រាក់
  bankName?: string;           // ឈ្មោះធនាគារ (ABA, Wing, ACLEDA, etc.)
  receiverName?: string;       // ឈ្មោះគណនីទទួល (Receiver / Beneficiary Name)
  imageUrl?: string;           // URL រូបភាពលើ Google Drive
  driveFileId?: string;        // ID ឯកសារលើ Google Drive
  driveViewUrl?: string;       // Link មើលលើ Google Drive
  imageBase64?: string;        // រូបភាព Base64 thumbnail/preview
  imageName?: string;          // ឈ្មោះឯកសារ
  note?: string;               // ចំណាំ
  operator: string;            // ឈ្មោះអ្នកបញ្ចូល
  operatorEmail: string;       // Email អ្នកបញ្ចូល (សម្រាប់កំណត់សិទ្ធិមើលតែរបស់ខ្លួន)
  telegramSent?: boolean;      // ស្ថានភាពផ្ញើទៅ Telegram Bot #4
  telegramMessageId?: number;  // ID សារ Telegram
  isVerified?: boolean;        // ស្ថានភាពផ្ទៀងផ្ទាត់ (ត្រឹមត្រូវ)
  verifiedBy?: string;         // អ្នកផ្ទៀងផ្ទាត់ (Accountant (manager))
  verifiedAt?: string;         // កាលបរិច្ឆេទ & ម៉ោងផ្ទៀងផ្ទាត់
  createdAt: string;           // កាលបរិច្ឆេទ & ម៉ោងបញ្ចូល
  syncedToGoogle?: boolean;    // Sync ទៅ Google Sheets រួចរាល់
}

export interface DistributionReportItem {
  id: string;
  barcode: string;             // លេខបាកូដ / AWBN / Tracking Code
  name: string;                // ឈ្មោះអ្នកដឹក / អ្នកទទួល / បុគ្គលិកចែកចាយ
  date: string;                // កាលបរិច្ឆេទចែកចាយ (YYYY-MM-DD)
  remarks: string;             // កំណត់សម្គាល់ / មតិយោបល់
  createdAt: string;           // ពេលវេលាកត់ត្រា
  createdBy?: string;          // អ្នកកត់ត្រា (ឈ្មោះ ឬ Email)
  operatorEmail?: string;      // Email អ្នកធ្វើប្រតិបត្តិការ
  updatedAt?: string;          // ពេលវេលាកែប្រែ
}

export type WarehouseScanType = 'SCAN_IN' | 'SCAN_OUT' | 'OUT_OF_DELIVERY' | 'HOLD_REMAINING';

export interface WarehouseScanItem {
  id: string;
  scanType: WarehouseScanType;    // 'SCAN_IN' | 'SCAN_OUT' | 'OUT_OF_DELIVERY' | 'HOLD_REMAINING'
  barcode: string;             // លេខបាកូដ / Tracking Code
  tracking?: string;           // Tracking Code / AWBN
  shipper?: string;            // អ្នកផ្ញើ / Shipper (ពី Data Report)
  consignee?: string;          // អ្នកទទួល / Consignee (ពី Data Report)
  payment?: string;            // ការទូទាត់ / Payment (ពី Data Report)
  customerName?: string;       // ឈ្មោះអតិថិជន (Auto-filled ពី Data Report បើរកឃើញ)
  customerPhone?: string;      // លេខទូរស័ព្ទអតិថិជន
  destination?: string;        // ទីតាំង / ខេត្ត / ក្រុង
  driverName?: string;         // ឈ្មោះ Driver / អ្នកបើកបរ
  truckNo?: string;            // ស្លាកលេខឡាន / Truck No
  codAmount?: number;          // ចំនួនទឹកប្រាក់ COD (បើមាន)
  currency?: 'USD' | 'KHR';    // ប្រភេទទឹកប្រាក់
  location?: string;           // ទីតាំងឃ្លាំង / ធ្នើរទុកអីវ៉ាន់ / Shelf / Rack (សម្រាប់ ScanIn)
  riderName?: string;          // ឈ្មោះអ្នកដឹក / Rider (សម្រាប់ Out of Delivery)
  riderPhone?: string;         // លេខទូរស័ព្ទ Rider
  deliveryZone?: string;       // តំបន់ដឹកជញ្ជូន / Route / Zone
  outReason?: string;          // មូលហេតុចេញពីឃ្លាំង (Transfer, Return, Customer Pick, etc.) សម្រាប់ ScanOut
  holdReason?: string;         // មូលហេតុនៅសល់ក្នុងឃ្លាំង (រង់ចាំជើងឡាន, ពន្យារពេល, etc.) សម្រាប់ HOLD_REMAINING
  shelfLocation?: string;      // ទីតាំងធ្នើរ / កន្លែងទុកក្នុងឃ្លាំង (ឧ. Shelf A, Zone 2)
  remarks?: string;            // ចំណាំបន្ថែម
  date: string;                // កាលបរិច្ឆេទ (YYYY-MM-DD)
  operatorEmail: string;       // Email អ្នកស្កេន
  createdBy: string;           // ឈ្មោះអ្នកស្កេន
  createdAt: string;           // ពេលវេលាកត់ត្រា (ISO)
  updatedAt?: string;          // ពេលវេលាកែប្រែ (ISO)
}

export type NavView =
  | 'COLLECTION'
  | 'PAYERS'
  | 'DATA'
  | 'DATA_BM'
  | 'FOLLOWUP_BM'
  | 'SOKIMEX_POSTPAID'
  | 'BANK_SLIPS'
  | 'DATA_REPORT'
  | 'DISTRIBUTION_REPORT'
  | 'WAREHOUSE'
  | 'SCAN_IN'
  | 'SCAN_OUT'
  | 'OUT_OF_DELIVERY'
  | 'HOLD_REMAINING'
  | 'PERMISSIONS'
  | 'SETTINGS';

