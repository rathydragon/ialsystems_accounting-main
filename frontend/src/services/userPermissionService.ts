import { UserPermission, normalizeUserRole, NavView, AuthUser } from '../types';
import { savePermissionToMaster, deletePermissionFromMaster } from './mysqlMasterService';
import { getProxiedGasUrl } from '../utils/gasProxy';
import { authFetch } from './apiClient';

const PERMISSIONS_STORAGE_KEY = 'ial_accounting_user_permissions_v1';
const PERMISSIONS_COLLECTION = 'user_permissions';

export const MASTER_ADMIN_EMAIL = 'rathykim34@gmail.com';
export const IAL_ACCOUNTING_EMAIL = 'ialexpress2023@gmail.com';

export interface NavPageMeta {
  id: NavView;
  titleKm: string;
  desc: string;
  iconName: string;
  category: 'FINANCE' | 'WAREHOUSE' | 'DATA_REPORTS' | 'SYSTEM' | 'OTHER';
  activeBg?: string;
  iconActive?: string;
  switchActive?: string;
}

export const CONFIGURABLE_NAV_PAGES_META: NavPageMeta[] = [
  {
    id: 'COLLECTION',
    titleKm: 'ទទួលប្រាក់ (Collection)',
    desc: 'កត់ត្រាការទូទាត់ប្រាក់ និងស្កេនវិក្កយបត្រ',
    iconName: 'LayoutDashboard',
    category: 'FINANCE',
    activeBg: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60',
    iconActive: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
    switchActive: 'bg-emerald-600'
  },
  {
    id: 'BANK_SLIPS',
    titleKm: 'បង្កាន់ដៃធនាគារ (Bank Slips)',
    desc: 'ពិនិត្យ និងស្វែងរកបង្កាន់ដៃធនាគារ & AWBN',
    iconName: 'Receipt',
    category: 'FINANCE',
    activeBg: 'bg-cyan-50/70 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/60',
    iconActive: 'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300',
    switchActive: 'bg-cyan-600'
  },
  {
    id: 'DATA_BM',
    titleKm: 'Pending BM',
    desc: 'តាមដាន និងគ្រប់គ្រងទិន្នន័យ BM កំពុងរង់ចាំ',
    iconName: 'FileSpreadsheet',
    category: 'FINANCE',
    activeBg: 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60',
    iconActive: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
    switchActive: 'bg-blue-600'
  },
  {
    id: 'FOLLOWUP_BM',
    titleKm: 'FollowUp BM',
    desc: 'ផ្ទៀងផ្ទាត់ និងតាមដានស្ថានភាពបន្តរបស់ BM',
    iconName: 'ClipboardCheck',
    category: 'FINANCE',
    activeBg: 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/60',
    iconActive: 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300',
    switchActive: 'bg-purple-600'
  },
  {
    id: 'SOKIMEX_POSTPAID',
    titleKm: 'SOKIMEX POSTPAID',
    desc: 'ទិន្នន័យប្រេងឥន្ធនៈ និងការទូទាត់ប្រេង Sokimex',
    iconName: 'Fuel',
    category: 'FINANCE',
    activeBg: 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60',
    iconActive: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
    switchActive: 'bg-amber-600'
  },
  {
    id: 'SCAN_IN',
    titleKm: 'ScanIn (ចូលឃ្លាំង)',
    desc: 'ស្កេនទំនិញចូលឃ្លាំង និងកត់ត្រាជើងដឹក',
    iconName: 'ArrowDownToLine',
    category: 'WAREHOUSE',
    activeBg: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60',
    iconActive: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
    switchActive: 'bg-emerald-600'
  },
  {
    id: 'SCAN_OUT',
    titleKm: 'ScanOut (ចេញពីឃ្លាំង)',
    desc: 'ស្កេនទំនិញចេញផ្ទេរទៅសាខា និងជើងឡាន',
    iconName: 'ArrowUpFromLine',
    category: 'WAREHOUSE',
    activeBg: 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60',
    iconActive: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
    switchActive: 'bg-amber-600'
  },
  {
    id: 'OUT_OF_DELIVERY',
    titleKm: 'Out of Delivery (Rider)',
    desc: 'ស្កេនទំនិញប្រគល់ឱ្យ Rider ចេញចែកចាយ',
    iconName: 'PackageCheck',
    category: 'WAREHOUSE',
    activeBg: 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60',
    iconActive: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
    switchActive: 'bg-blue-600'
  },
  {
    id: 'HOLD_REMAINING',
    titleKm: 'នៅសល់ក្នុងឃ្លាំង (Hold)',
    desc: 'ស្កេនកត់ត្រាទំនិញផ្អាក ឬនៅសល់ក្នុងឃ្លាំង',
    iconName: 'Archive',
    category: 'WAREHOUSE',
    activeBg: 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/60',
    iconActive: 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300',
    switchActive: 'bg-purple-600'
  },
  {
    id: 'ARRIVED_HUB',
    titleKm: 'Arrived Hub (ទទួលចូលឃ្លាំង)',
    desc: 'ស្កេនទទួលទំនិញពីប្រតិបត្តិការ ScanOut និងផ្ទៀងផ្ទាត់',
    iconName: 'PackageOpen',
    category: 'WAREHOUSE',
    activeBg: 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/60',
    iconActive: 'bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300',
    switchActive: 'bg-teal-600'
  },
  {
    id: 'RETURN_SHIPMENTS',
    titleKm: 'ទំនិញបង្វិលត្រឡប់ (Return)',
    desc: 'កត់ត្រា និងតាមដានកញ្ចប់ដែលត្រូវបង្វិលទៅម្ចាស់វិញ',
    iconName: 'Undo2',
    category: 'WAREHOUSE',
    activeBg: 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60',
    iconActive: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
    switchActive: 'bg-rose-600'
  },
  {
    id: 'DISTRIBUTION_REPORT',
    titleKm: 'របាយការណ៍ចែកចាយ (Distribution)',
    desc: 'របាយការណ៍ចែកចាយ និងសម្រង់ទិន្នន័យដឹកជញ្ជូន',
    iconName: 'Truck',
    category: 'WAREHOUSE',
    activeBg: 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/60',
    iconActive: 'bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300',
    switchActive: 'bg-orange-600'
  },
  {
    id: 'IALE_TRACKING',
    titleKm: 'IALE Tracking API',
    desc: 'ទិន្នន័យប្រព័ន្ធតាមដានទំនិញ IALE Live',
    iconName: 'Database',
    category: 'WAREHOUSE',
    activeBg: 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/60',
    iconActive: 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300',
    switchActive: 'bg-sky-600'
  },
  {
    id: 'TG_BOOKING',
    titleKm: 'Telegram Booking',
    desc: 'កត់ត្រាការកក់ពី Channel IAL Booking និងអ្នក Pick up',
    iconName: 'Send',
    category: 'WAREHOUSE',
    activeBg: 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/60',
    iconActive: 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300',
    switchActive: 'bg-sky-600'
  },
  {
    id: 'DATA_REPORT',
    titleKm: 'Data Report',
    desc: 'របាយការណ៍សង្ខេប ប្រតិបត្តិការទូទាត់ និងក្រាហ្វិក',
    iconName: 'BarChart3',
    category: 'DATA_REPORTS',
    activeBg: 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/60',
    iconActive: 'bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300',
    switchActive: 'bg-teal-600'
  },
  {
    id: 'METERIAL_OFFICE',
    titleKm: 'Meterial_Office',
    desc: 'របាយការណ៍សម្ភារៈការិយាល័យ និងទិន្នន័យពី Google Sheets',
    iconName: 'Boxes',
    category: 'DATA_REPORTS',
    activeBg: 'bg-cyan-50/70 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/60',
    iconActive: 'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300',
    switchActive: 'bg-cyan-600'
  },
  {
    id: 'DATA',
    titleKm: 'ទិន្នន័យទូទៅ (Data)',
    desc: 'មើល និងគ្រប់គ្រងទិន្នន័យប្រតិបត្តិការប្រព័ន្ធ',
    iconName: 'Database',
    category: 'DATA_REPORTS',
    activeBg: 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/60',
    iconActive: 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300',
    switchActive: 'bg-sky-600'
  },
  {
    id: 'PAYERS',
    titleKm: 'បុគ្គលិកក្រុមហ៊ុន (Company Staff)',
    desc: 'គ្រប់គ្រងបញ្ជីឈ្មោះបុគ្គលិក និងអ្នកទូទាត់',
    iconName: 'Users',
    category: 'DATA_REPORTS',
    activeBg: 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/60',
    iconActive: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300',
    switchActive: 'bg-indigo-600'
  },
  {
    id: 'CUSTOMERS',
    titleKm: 'ព័ត៌មានអតិថិជន (Customers)',
    desc: 'គ្រប់គ្រងបញ្ជីអតិថិជន លេខទូរស័ព្ទ និងអាសយដ្ឋាន',
    iconName: 'Contact',
    category: 'DATA_REPORTS',
    activeBg: 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60',
    iconActive: 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300',
    switchActive: 'bg-blue-600'
  }
];

export const ALL_CONFIGURABLE_NAV_PAGES: NavView[] = CONFIGURABLE_NAV_PAGES_META.map(p => p.id);

/**
 * Automatically discovers all configurable pages across the system and from any dynamic user permissions.
 * If new pages are added in the app or exist in user permissions, this dynamically merges them so counts
 * and checklists update automatically!
 */
export function getAllObservedNavPages(permissions?: UserPermission[]): NavView[] {
  const set = new Set<string>(ALL_CONFIGURABLE_NAV_PAGES);
  if (Array.isArray(permissions)) {
    for (const p of permissions) {
      if (Array.isArray(p.allowedPages)) {
        for (const pageId of p.allowedPages) {
          if (pageId && typeof pageId === 'string' && pageId !== 'PERMISSIONS' && pageId !== 'SETTINGS') {
            set.add(pageId);
          }
        }
      }
    }
  }
  return Array.from(set) as NavView[];
}

export function getDefaultAllowedPages(role?: string | null): NavView[] {
  const norm = normalizeUserRole(role);
  if (norm === 'DELIVERY' || norm === 'DELIVERY_OPT') {
    return ['BANK_SLIPS', 'DISTRIBUTION_REPORT', 'OUT_OF_DELIVERY'];
  }
  if (norm === 'CS_TEAMS' || norm === 'CS_TEAMS_OPT') {
    return ['COLLECTION', 'PAYERS', 'DATA_BM', 'FOLLOWUP_BM', 'DATA_REPORT', 'METERIAL_OFFICE', 'DISTRIBUTION_REPORT', 'SCAN_IN', 'HOLD_REMAINING'];
  }
  if (norm === 'HUB' || norm === 'HUB_OPT') {
    return ['COLLECTION', 'DATA_REPORT', 'METERIAL_OFFICE', 'DISTRIBUTION_REPORT', 'SCAN_IN', 'SCAN_OUT', 'HOLD_REMAINING', 'ARRIVED_HUB', 'RETURN_SHIPMENTS'];
  }
  if (norm === 'TAXI' || norm === 'TAXI_OPT') {
    return ['BANK_SLIPS', 'DISTRIBUTION_REPORT', 'OUT_OF_DELIVERY'];
  }
  if (norm === 'SALE_REP') {
    return ['CUSTOMERS', 'COLLECTION', 'PAYERS', 'DATA_REPORT', 'IALE_TRACKING', 'DISTRIBUTION_REPORT'];
  }
  if (norm === 'SALE_GM') {
    return ['CUSTOMERS', 'COLLECTION', 'PAYERS', 'DATA', 'DATA_REPORT', 'IALE_TRACKING', 'DISTRIBUTION_REPORT', 'TG_BOOKING'];
  }
  return [...ALL_CONFIGURABLE_NAV_PAGES];
}

export function canUserAccessPage(
  view: NavView,
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  const isMaster = isMasterAdmin(email);
  if (isMaster) return true;

  // PERMISSIONS and SETTINGS are strictly reserved for ADMIN role
  if (view === 'PERMISSIONS' || view === 'SETTINGS') {
    return user.role === 'ADMIN';
  }

  const checkList = (list: NavView[]): boolean => {
    if (list.includes(view)) return true;
    // Backward compatibility: if user has 'WAREHOUSE', they can access any warehouse sub-page
    if (view === 'SCAN_IN' || view === 'SCAN_OUT' || view === 'OUT_OF_DELIVERY' || view === 'HOLD_REMAINING' || view === 'ARRIVED_HUB' || view === 'RETURN_SHIPMENTS' || view === 'WAREHOUSE') {
      if (list.includes('WAREHOUSE')) return true;
      if (view === 'WAREHOUSE') {
        return (
          list.includes('SCAN_IN') ||
          list.includes('SCAN_OUT') ||
          list.includes('OUT_OF_DELIVERY') ||
          list.includes('HOLD_REMAINING') ||
          list.includes('ARRIVED_HUB') ||
          list.includes('RETURN_SHIPMENTS')
        );
      }
    }
    return false;
  };

  // 1. Primary Check: permissions list (Authoritative source of truth from Database/Settings)
  if (permissions && email) {
    const matched = permissions.find(p => p.email.toLowerCase().trim() === email);
    if (matched) {
      if (Array.isArray(matched.allowedPages)) {
        return checkList(matched.allowedPages);
      }
      return checkList(getDefaultAllowedPages(matched.role));
    }
  }

  // 2. Secondary Check: user object's allowedPages (from active session fallback)
  if (Array.isArray(user.allowedPages)) {
    return checkList(user.allowedPages);
  }

  // 3. Fallback to default allowed pages by user's role
  return checkList(getDefaultAllowedPages(user.role));
}

export const DEFAULT_MASTER_ADMIN: UserPermission = {
  id: 'u-master-admin',
  email: MASTER_ADMIN_EMAIL,
  name: 'KEUN RATHY',
  role: 'ADMIN',
  status: 'ACTIVE',
  canCreate: true,
  canEdit: true,
  canDelete: true,
  allowedPages: [...ALL_CONFIGURABLE_NAV_PAGES],
  createdAt: '2026-01-01T00:00:00.000Z'
};

export const DEFAULT_IAL_ACCOUNTING: UserPermission = {
  id: 'u-ial-accounting',
  email: IAL_ACCOUNTING_EMAIL,
  name: 'IAL Accounting',
  role: 'ACCOUNTANT',
  status: 'ACTIVE',
  canCreate: true,
  canEdit: true,
  canDelete: false,
  allowedPages: [...ALL_CONFIGURABLE_NAV_PAGES],
  createdAt: '2026-01-01T00:00:00.000Z'
};

export const DEFAULT_USERS: UserPermission[] = [
  DEFAULT_MASTER_ADMIN,
  DEFAULT_IAL_ACCOUNTING
];

export function isMasterAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === MASTER_ADMIN_EMAIL;
}

/**
 * Strict Operator Resolution based strictly on authenticated login email.
 * This guarantees:
 * - rathykim34@gmail.com -> KEUN RATHY
 * - ialexpress2023@gmail.com -> IAL Accounting
 * - Other emails -> Name configured in Permissions for that email (or Google name / clean email prefix)
 * - NEVER contaminates one user's identity with another user's name
 */
export function resolveOperator(
  user: { email?: string; name?: string } | null | undefined,
  permissions?: UserPermission[]
): { name: string; email: string; display: string } {
  const email = user?.email?.toLowerCase().trim() || '';
  if (!email) {
    return {
      name: 'Unknown',
      email: '',
      display: 'Unknown'
    };
  }

  // 1. Registered user in Permissions table (Admin-assigned name has priority)
  const matchedPerm = permissions?.find(p => p.email.toLowerCase().trim() === email);
  if (matchedPerm && matchedPerm.name && matchedPerm.name.trim()) {
    const assignedName = matchedPerm.name.trim();
    return {
      name: assignedName,
      email: email,
      display: `${assignedName} (${email})`
    };
  }

  // 2. Strict Check: rathykim34@gmail.com is 100% KEUN RATHY (Master Admin)
  if (isMasterAdmin(email)) {
    const adminName = user?.name && !user.name.toLowerCase().includes('ial')
      ? user.name.trim()
      : 'KEUN RATHY';
    return {
      name: adminName,
      email: email,
      display: `${adminName} (${email})`
    };
  }

  // 3. Fallback for ialexpress2023@gmail.com if not configured in Permissions
  if (email === IAL_ACCOUNTING_EMAIL) {
    return {
      name: 'IAL Accounting',
      email: email,
      display: `IAL Accounting (${email})`
    };
  }

  // 4. If Google token has a name, use it UNLESS it's contaminated with Keun Rathy on a shared device
  if (user?.name && user.name.trim()) {
    const rawName = user.name.trim();
    if (rawName.toLowerCase() !== 'keun rathy' && rawName.toLowerCase() !== 'rathy kim') {
      return {
        name: rawName,
        email: email,
        display: `${rawName} (${email})`
      };
    }
  }

  // 5. Fallback cleanly to capitalized email prefix
  const prefix = email.split('@')[0];
  const capitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  return {
    name: capitalized,
    email: email,
    display: `${capitalized} (${email})`
  };
}

const permissionSubscribers = new Set<(permissions: UserPermission[]) => void>();

function notifyPermissionSubscribers(perms: UserPermission[]): void {
  permissionSubscribers.forEach((cb) => {
    try {
      cb(perms);
    } catch (e) {
      console.warn('Permission subscriber error:', e);
    }
  });
}

export function getLocalCachedPermissions(): UserPermission[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PERMISSIONS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (_) {}

  // Default master admins fallback
  return [
    {
      id: 'master-admin-1',
      email: MASTER_ADMIN_EMAIL,
      name: 'KEUN RATHY',
      role: 'ADMIN',
      status: 'ACTIVE',
      viewOnlyOwn: false,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      allowedPages: [...ALL_CONFIGURABLE_NAV_PAGES],
      createdAt: '2025-01-01T00:00:00.000Z'
    },
    {
      id: 'master-admin-2',
      email: IAL_ACCOUNTING_EMAIL,
      name: 'IAL Express Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      viewOnlyOwn: false,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      allowedPages: [...ALL_CONFIGURABLE_NAV_PAGES],
      createdAt: '2025-01-01T00:00:00.000Z'
    }
  ];
}

export function saveLocalCachedPermissions(perms: UserPermission[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(perms));
    }
  } catch (err) {
    console.warn('Failed to save permissions to LocalStorage:', err);
  }
}

/**
 * Fetch all user permissions (Loaded from local server API / local cache)
 */
export async function fetchPermissions(): Promise<UserPermission[]> {
  try {
    const res = await authFetch('/api/permissions');
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
        saveLocalCachedPermissions(json.data);
        return json.data;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch from /api/permissions:', err);
  }
  return getLocalCachedPermissions();
}

/**
 * Save single user permission (Saves to server API, local cache & Google Sheets)
 */
export async function savePermission(perm: UserPermission): Promise<boolean> {
  const current = getLocalCachedPermissions();
  const cleanEmail = perm.email.toLowerCase().trim();
  const isMaster = isMasterAdmin(cleanEmail);
  const role = isMaster ? 'ADMIN' : normalizeUserRole(perm.role);
  const allowedPages = isMaster
    ? [...ALL_CONFIGURABLE_NAV_PAGES]
    : Array.isArray(perm.allowedPages)
    ? perm.allowedPages
    : getDefaultAllowedPages(role);

  const formatted: UserPermission = {
    ...perm,
    email: cleanEmail,
    role: role,
    status: isMaster ? 'ACTIVE' : perm.status,
    viewOnlyOwn: isMaster ? false : Boolean(perm.viewOnlyOwn),
    canCreate: isMaster ? true : perm.canCreate !== undefined ? Boolean(perm.canCreate) : true,
    canEdit: isMaster ? true : perm.canEdit !== undefined ? Boolean(perm.canEdit) : false,
    canDelete: isMaster ? true : perm.canDelete !== undefined ? Boolean(perm.canDelete) : false,
    allowedPages: allowedPages,
    updatedAt: new Date().toISOString()
  };

  const existingIdx = current.findIndex((p) => p.email.toLowerCase().trim() === cleanEmail);
  let updatedList: UserPermission[];
  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = formatted;
  } else {
    updatedList = [formatted, ...current];
  }

  saveLocalCachedPermissions(updatedList);
  notifyPermissionSubscribers(updatedList);

  // 1. Save to Hostinger Remote MySQL Master Database (Real-time)
  savePermissionToMaster(formatted).catch(err => {
    console.warn('[userPermissionService] Master MySQL permission save error:', err);
  });

  // 2. Sync to local server API so Wi-Fi devices get it immediately
  try {
    authFetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', permission: formatted })
    }).catch(err => console.warn('/api/permissions save error:', err));
  } catch (_) {}

  // 3. Sync to Google Sheets in background
  try {
    const raw = typeof window !== 'undefined' ? (localStorage.getItem('accounting_app_settings_v2') || localStorage.getItem('accounting_app_settings')) : null;
    let webAppUrl = '';
    if (raw) {
      const parsed = JSON.parse(raw);
      webAppUrl = parsed?.webAppUrl?.trim() || '';
    }
    savePermissionToGoogleSheets(formatted, webAppUrl);
  } catch (_) {}

  return true;
}

/**
 * Bulk sync all permissions to Server API, LocalStorage & Google Sheets
 */
export async function syncAllPermissions(perms: UserPermission[]): Promise<boolean> {
  if (!Array.isArray(perms)) return false;
  saveLocalCachedPermissions(perms);
  notifyPermissionSubscribers(perms);

  try {
    authFetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_sync', permissions: perms })
    }).catch(err => console.warn('/api/permissions bulk_sync error:', err));
  } catch (_) {}

  return true;
}

/**
 * Delete permission (Removes from Server API, local cache & Google Sheets)
 */
export async function deletePermission(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (isMasterAdmin(cleanEmail)) return false;

  const current = getLocalCachedPermissions();
  const updatedList = current.filter((p) => p.email.toLowerCase().trim() !== cleanEmail);

  saveLocalCachedPermissions(updatedList);
  notifyPermissionSubscribers(updatedList);

  // 1. Delete from Hostinger Remote MySQL Master Database (Primary Authoritative)
  deletePermissionFromMaster(cleanEmail).catch(err => {
    console.warn('[userPermissionService] Master MySQL permission delete error:', err);
  });

  // 2. Delete from local server API
  try {
    authFetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', email: cleanEmail })
    }).catch(err => console.warn('/api/permissions delete error:', err));
  } catch (_) {}

  // 3. Sync delete to Google Sheets in background
  try {
    const raw = typeof window !== 'undefined' ? (localStorage.getItem('accounting_app_settings_v2') || localStorage.getItem('accounting_app_settings')) : null;
    let webAppUrl = '';
    if (raw) {
      const parsed = JSON.parse(raw);
      webAppUrl = parsed?.webAppUrl?.trim() || '';
    }
    deletePermissionFromGoogleSheets(cleanEmail, webAppUrl);
  } catch (_) {}

  return true;
}

/**
 * Subscribe to real-time changes in User Permissions (Local cache & storage events)
 */
export function subscribeToPermissions(
  onUpdate: (permissions: UserPermission[]) => void,
  _onError?: (error: any) => void
): () => void {
  permissionSubscribers.add(onUpdate);

  // Instantly emit current permissions
  onUpdate(getLocalCachedPermissions());

  const handleStorage = (e: StorageEvent) => {
    if (e.key === PERMISSIONS_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed)) {
          onUpdate(parsed);
        }
      } catch (_) {}
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    permissionSubscribers.delete(onUpdate);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}



/**
 * Bulk sync all permissions to Google Sheets with all 13 columns
 */
export async function syncAllPermissionsToGoogleSheets(
  perms: UserPermission[],
  webAppUrl?: string,
  userEmail?: string
): Promise<{ success: boolean; message: string }> {
  if (!webAppUrl || !webAppUrl.trim() || !Array.isArray(perms) || perms.length === 0) {
    return { success: false, message: 'Web App URL missing or no permissions' };
  }

  try {
    const formattedPerms = perms.map(p => {
      const email = p.email.toLowerCase().trim();
      const isMaster = isMasterAdmin(email);
      const role = isMaster ? 'ADMIN' : normalizeUserRole(p.role);
      const viewOnlyOwn = isMaster ? false : Boolean(p.viewOnlyOwn);
      const canCreate = isMaster ? true : (p.canCreate !== undefined ? Boolean(p.canCreate) : (role !== 'VIEWER'));
      const canEdit = isMaster ? true : (p.canEdit !== undefined ? Boolean(p.canEdit) : ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(role));
      const canDelete = isMaster ? true : (p.canDelete !== undefined ? Boolean(p.canDelete) : ['ADMIN', 'ACCOUNTANT_MANAGER'].includes(role));
      const allowedPages = isMaster ? ALL_CONFIGURABLE_NAV_PAGES : (Array.isArray(p.allowedPages) ? p.allowedPages : getDefaultAllowedPages(role));

      return {
        id: p.id,
        email: email,
        name: p.name?.trim() || email.split('@')[0],
        role: role,
        status: isMaster ? 'ACTIVE' : p.status,
        dataScope: viewOnlyOwn ? 'OWN_ONLY' : 'ALL_DATA',
        viewOnlyOwn: viewOnlyOwn,
        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        allowedPages: allowedPages,
        createdAt: p.createdAt || new Date().toISOString(),
        lastLogin: p.lastLogin || '',
        updatedAt: p.updatedAt || new Date().toISOString()
      };
    });

    const targetUrl = getProxiedGasUrl(webAppUrl.trim());
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_permissions',
        permissions: formattedPerms,
        user: userEmail
      })
    });

    return { success: true, message: `Synced ${perms.length} permissions to Google Sheets` };
  } catch (err: any) {
    console.warn('Error syncing permissions to Google Sheets:', err);
    return { success: false, message: err?.message || 'Network error' };
  }
}

/**
 * Fetch permissions from Google Sheets with full 13 columns parsed
 */
export async function fetchPermissionsFromGoogleSheets(
  webAppUrl?: string
): Promise<UserPermission[]> {
  if (!webAppUrl || !webAppUrl.trim()) return [];
  try {
    const targetUrl = getProxiedGasUrl(`${webAppUrl.trim()}?action=get_permissions&t=${Date.now()}`);
    const res = await fetch(targetUrl);
    if (!res.ok) return [];
    const json = await res.json();
    if (json && json.status === 'success' && Array.isArray(json.data)) {
      return json.data.map((raw: any) => {
        const email = String(raw.email || '').toLowerCase().trim();
        const isMaster = isMasterAdmin(email);
        const role = isMaster ? 'ADMIN' : normalizeUserRole(raw.role);

        let viewOnlyOwn = false;
        if (raw.viewOnlyOwn !== undefined) {
          viewOnlyOwn = Boolean(raw.viewOnlyOwn);
        } else if (raw.dataScope) {
          viewOnlyOwn = String(raw.dataScope).toUpperCase().includes('OWN');
        }

        let canCreate = isMaster ? true : (role !== 'VIEWER');
        if (raw.canCreate !== undefined && String(raw.canCreate).trim() !== '') {
          canCreate = isMaster ? true : (raw.canCreate === true || String(raw.canCreate).toUpperCase() === 'TRUE');
        }

        let canEdit = isMaster ? true : ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(role);
        if (raw.canEdit !== undefined && String(raw.canEdit).trim() !== '') {
          canEdit = isMaster ? true : (raw.canEdit === true || String(raw.canEdit).toUpperCase() === 'TRUE');
        }

        let canDelete = isMaster ? true : ['ADMIN', 'ACCOUNTANT_MANAGER'].includes(role);
        if (raw.canDelete !== undefined && String(raw.canDelete).trim() !== '') {
          canDelete = isMaster ? true : (raw.canDelete === true || String(raw.canDelete).toUpperCase() === 'TRUE');
        }

        let allowedPages: NavView[] = isMaster ? [...ALL_CONFIGURABLE_NAV_PAGES] : getDefaultAllowedPages(role);
        if (Array.isArray(raw.allowedPages) && raw.allowedPages.length > 0) {
          allowedPages = raw.allowedPages;
        } else if (typeof raw.allowedPages === 'string' && raw.allowedPages.trim()) {
          const str = raw.allowedPages.trim();
          if (str.toUpperCase() === 'ALL' || str === '*') {
            allowedPages = [...ALL_CONFIGURABLE_NAV_PAGES];
          } else {
            allowedPages = str.split(',').map((s: string) => s.trim().toUpperCase() as NavView).filter(Boolean);
          }
        }

        return {
          id: raw.id || `u-${Date.now()}`,
          email: email,
          name: raw.name?.trim() || email.split('@')[0],
          role: role,
          status: isMaster ? 'ACTIVE' : (raw.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
          viewOnlyOwn: isMaster ? false : viewOnlyOwn,
          canCreate: canCreate,
          canEdit: canEdit,
          canDelete: canDelete,
          allowedPages: allowedPages,
          createdAt: raw.createdAt || new Date().toISOString(),
          lastLogin: raw.lastLogin || undefined,
          updatedAt: raw.updatedAt || undefined
        };
      });
    }
  } catch (err) {
    console.warn('fetchPermissionsFromGoogleSheets error:', err);
  }
  return [];
}

/**
 * Save single user permission to Google Sheets with all 13 columns
 */
export async function savePermissionToGoogleSheets(
  perm: UserPermission,
  webAppUrl?: string,
  userEmail?: string
): Promise<boolean> {
  if (!webAppUrl || !webAppUrl.trim()) return false;
  try {
    const email = perm.email.toLowerCase().trim();
    const isMaster = isMasterAdmin(email);
    const role = isMaster ? 'ADMIN' : normalizeUserRole(perm.role);
    const viewOnlyOwn = isMaster ? false : Boolean(perm.viewOnlyOwn);
    const canCreate = isMaster ? true : (perm.canCreate !== undefined ? Boolean(perm.canCreate) : (role !== 'VIEWER'));
    const canEdit = isMaster ? true : (perm.canEdit !== undefined ? Boolean(perm.canEdit) : ['ADMIN', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(role));
    const canDelete = isMaster ? true : (perm.canDelete !== undefined ? Boolean(perm.canDelete) : ['ADMIN', 'ACCOUNTANT_MANAGER'].includes(role));
    const allowedPages = isMaster ? ALL_CONFIGURABLE_NAV_PAGES : (Array.isArray(perm.allowedPages) ? perm.allowedPages : getDefaultAllowedPages(role));

    const payload = {
      action: 'save_permission',
      permission: {
        id: perm.id,
        email: email,
        name: perm.name?.trim() || email.split('@')[0],
        role: role,
        status: isMaster ? 'ACTIVE' : perm.status,
        dataScope: viewOnlyOwn ? 'OWN_ONLY' : 'ALL_DATA',
        viewOnlyOwn: viewOnlyOwn,
        canCreate: canCreate,
        canEdit: canEdit,
        canDelete: canDelete,
        allowedPages: allowedPages,
        createdAt: perm.createdAt || new Date().toISOString(),
        lastLogin: perm.lastLogin || '',
        updatedAt: new Date().toISOString()
      },
      user: userEmail
    };

    const targetUrl = getProxiedGasUrl(webAppUrl.trim());
    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.warn('Google Sheets save_permission error:', err));
    return true;
  } catch (err) {
    console.warn('savePermissionToGoogleSheets error:', err);
    return false;
  }
}

/**
 * Delete user permission from Google Sheets
 */
export async function deletePermissionFromGoogleSheets(
  email: string,
  webAppUrl?: string,
  userEmail?: string,
  id?: string
): Promise<boolean> {
  if (!webAppUrl || !webAppUrl.trim()) return false;
  try {
    const payload = {
      action: 'delete_permission',
      email: email.toLowerCase().trim(),
      id: id,
      user: userEmail
    };

    const targetUrl = getProxiedGasUrl(webAppUrl.trim());
    fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => console.warn('Google Sheets delete_permission error:', err));
    return true;
  } catch (err) {
    console.warn('deletePermissionFromGoogleSheets error:', err);
    return false;
  }
}

/**
 * Check if the user is allowed to view all records, or restricted to their own (Data Scope: OWN_ONLY).
 * Returns true if user can view ALL data.
 * Returns false if user is restricted to their OWN records only.
 */
/**
 * Arrived Hub: the Destination(s) a user receives at.
 * Returns null for Admin (sees every location); otherwise the assigned list (empty = sees nothing).
 */
export function getUserAllowedLocations(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): string[] | null {
  if (!user) return [];
  const email = (user.email || '').toLowerCase().trim();
  if (isMasterAdmin(email) || user.role === 'ADMIN') return null;
  const matched = permissions?.find((p) => p.email.toLowerCase().trim() === email);
  return Array.isArray(matched?.allowedLocations) ? matched!.allowedLocations : [];
}

/**
 * Loose match between a Destination value and an assigned location, so that
 * 'ខេត្តសៀមរាប (Siem Reap)', 'Siem Reap' and 'ខេត្តសៀមរាប' all count as the same place.
 */
export function isLocationMatch(destination?: string, location?: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
  const d = norm(destination || '');
  const l = norm(location || '');
  if (!d || !l) return false;
  if (d === l) return true;
  const parts = (v: string) => {
    const m = v.match(/^(.*?)\s*\((.*)\)\s*$/);
    return (m ? [m[1], m[2]] : [v]).map((x) => x.trim()).filter((x) => x.length >= 3);
  };
  const dParts = parts(d);
  return parts(l).some((lp) => dParts.some((dp) => dp === lp || dp.includes(lp) || lp.includes(dp)));
}

export function canUserViewAllData(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  if (isMasterAdmin(email)) return true;
  if (user.role === 'ADMIN') return true;

  // 1. Explicit check on currentUser session object
  if (user.viewOnlyOwn === true) {
    return false;
  }

  // 2. Check matched permission in permissions list
  if (permissions && email) {
    const perm = permissions.find((p) => p.email.toLowerCase().trim() === email);
    if (perm) {
      if (perm.viewOnlyOwn === true) {
        return false;
      }
      if (perm.viewOnlyOwn === false) {
        return true;
      }
      if (perm.role === 'ADMIN' || perm.role === 'ACCOUNTANT_MANAGER') {
        return true;
      }
    }
  }

  // 3. Fallback based on user.viewOnlyOwn boolean
  if (user.viewOnlyOwn !== undefined) {
    return !user.viewOnlyOwn;
  }

  return true;
}

/**
 * Helper to check if user has Data Scope set to 'Own Only'
 */
export function isUserOwnOnly(
  user?: AuthUser | null,
  permissions?: UserPermission[]
): boolean {
  return !canUserViewAllData(user, permissions);
}

// Backward-compatible aliases
export const savePermissionToFirestore = savePermission;
export const syncAllPermissionsToFirestore = syncAllPermissions;
export const deletePermissionFromFirestore = deletePermission;

