import { SupabaseClient } from '@supabase/supabase-js';
import { UserPermission, NavView, normalizeUserRole } from './types';
import {
  isMasterAdmin,
  ALL_CONFIGURABLE_NAV_PAGES,
  getDefaultAllowedPages,
  savePermissionToGoogleSheets,
  deletePermissionFromGoogleSheets
} from './services/userPermissionService';

/**
 * 🔒 SUPABASE IS FULLY DISCONNECTED
 * System operates 100% via Google Sheets as Primary Backend & Local Storage Cache.
 */
export const DEFAULT_SUPABASE_URL = '';
export const DEFAULT_SUPABASE_ANON_KEY = '';

const PERMISSIONS_STORAGE_KEY = 'ial_accounting_user_permissions_v1';

export function getActiveSupabaseConfig(): { url: string; anonKey: string } {
  return { url: '', anonKey: '' };
}

export function getSupabaseClient(): SupabaseClient | null {
  // Supabase connection permanently disabled / disconnected
  return null;
}

export function isSupabaseRealtimeConfigured(): boolean {
  return false;
}

/**
 * Helper to get local cached permissions
 */
function getLocalCachedPermissions(): UserPermission[] {
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
      email: 'rathykim34@gmail.com',
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
      email: 'ialexpress2023@gmail.com',
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

/**
 * Helper to save local cached permissions
 */
function saveLocalCachedPermissions(perms: UserPermission[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(perms));
    }
  } catch (err) {
    console.warn('Failed to save permissions to LocalStorage:', err);
  }
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

/**
 * Fetch all user permissions (Loaded from local cache / Google Sheets)
 */
/**
 * Fetch all user permissions (Loaded from local server API / local cache / Google Sheets)
 */
export async function fetchPermissionsFromSupabase(): Promise<UserPermission[]> {
  try {
    const res = await fetch('/api/permissions');
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
export async function savePermissionToSupabase(perm: UserPermission): Promise<boolean> {
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

  // Sync to local server API so Wi-Fi devices get it immediately
  try {
    fetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', permission: formatted })
    }).catch(err => console.warn('/api/permissions save error:', err));
  } catch (_) {}

  // Sync to Google Sheets in background
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
export async function syncAllPermissionsToSupabase(perms: UserPermission[]): Promise<boolean> {
  if (!Array.isArray(perms)) return false;
  saveLocalCachedPermissions(perms);
  notifyPermissionSubscribers(perms);

  try {
    fetch('/api/permissions', {
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
export async function deletePermissionFromSupabase(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  if (isMasterAdmin(cleanEmail)) return false;

  const current = getLocalCachedPermissions();
  const updatedList = current.filter((p) => p.email.toLowerCase().trim() !== cleanEmail);

  saveLocalCachedPermissions(updatedList);
  notifyPermissionSubscribers(updatedList);

  try {
    fetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', email: cleanEmail })
    }).catch(err => console.warn('/api/permissions delete error:', err));
  } catch (_) {}

  // Sync delete to Google Sheets in background
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
 * Subscribe to real-time changes in user permissions (Instant local cache + storage listener)
 */
export function subscribeToSupabasePermissions(
  onUpdate: (permissions: UserPermission[]) => void
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
