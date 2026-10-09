import { UserPermission, normalizeUserRole, NavView, AuthUser } from '../types';
import {
  subscribeToSupabasePermissions
} from '../supabase';

const PERMISSIONS_COLLECTION = 'user_permissions';

export const MASTER_ADMIN_EMAIL = 'rathykim34@gmail.com';
export const IAL_ACCOUNTING_EMAIL = 'ialexpress2023@gmail.com';

export const ALL_CONFIGURABLE_NAV_PAGES: NavView[] = [
  'COLLECTION',
  'PAYERS',
  'DATA',
  'DATA_BM',
  'FOLLOWUP_BM',
  'SOKIMEX_POSTPAID',
  'BANK_SLIPS',
  'DATA_REPORT',
  'METERIAL_OFFICE',
  'DISTRIBUTION_REPORT',
  'SCAN_IN',
  'SCAN_OUT',
  'OUT_OF_DELIVERY',
  'HOLD_REMAINING'
];

export function getDefaultAllowedPages(role?: string | null): NavView[] {
  const norm = normalizeUserRole(role);
  if (norm === 'DELIVERY' || norm === 'DELIVERY_OPT') {
    return ['BANK_SLIPS', 'DISTRIBUTION_REPORT', 'OUT_OF_DELIVERY'];
  }
  if (norm === 'CS_TEAMS' || norm === 'CS_TEAMS_OPT') {
    return ['COLLECTION', 'PAYERS', 'DATA_BM', 'FOLLOWUP_BM', 'DATA_REPORT', 'METERIAL_OFFICE', 'DISTRIBUTION_REPORT', 'SCAN_IN', 'HOLD_REMAINING'];
  }
  if (norm === 'HUB' || norm === 'HUB_OPT') {
    return ['COLLECTION', 'DATA_REPORT', 'METERIAL_OFFICE', 'DISTRIBUTION_REPORT', 'SCAN_IN', 'SCAN_OUT', 'HOLD_REMAINING'];
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
    if (view === 'SCAN_IN' || view === 'SCAN_OUT' || view === 'OUT_OF_DELIVERY' || view === 'HOLD_REMAINING' || view === 'WAREHOUSE') {
      if (list.includes('WAREHOUSE')) return true;
      if (view === 'WAREHOUSE') {
        return (
          list.includes('SCAN_IN') ||
          list.includes('SCAN_OUT') ||
          list.includes('OUT_OF_DELIVERY') ||
          list.includes('HOLD_REMAINING')
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

/**
 * Subscribe to real-time changes in User Permissions from Supabase Realtime
 */
export function subscribeToPermissions(
  onUpdate: (permissions: UserPermission[]) => void,
  _onError?: (error: any) => void
): () => void {
  return subscribeToSupabasePermissions(onUpdate);
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

    await fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sync_permissions',
        permissions: formattedPerms,
        user: userEmail
      }),
      mode: 'no-cors'
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
    const res = await fetch(`${webAppUrl.trim()}?action=get_permissions&t=${Date.now()}`);
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

    fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      mode: 'no-cors'
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

    fetch(webAppUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      mode: 'no-cors'
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

// Re-export Supabase Primary Database methods and backwards-compatible aliases
export {
  fetchPermissionsFromSupabase,
  savePermissionToSupabase,
  syncAllPermissionsToSupabase,
  deletePermissionFromSupabase,
  subscribeToSupabasePermissions,
  isSupabaseRealtimeConfigured,
  savePermissionToSupabase as savePermissionToFirestore,
  syncAllPermissionsToSupabase as syncAllPermissionsToFirestore,
  deletePermissionFromSupabase as deletePermissionFromFirestore
} from '../supabase';

