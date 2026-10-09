import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserPermission, NavView, normalizeUserRole } from './types';
import { isMasterAdmin, ALL_CONFIGURABLE_NAV_PAGES, getDefaultAllowedPages } from './services/userPermissionService';

export function getActiveSupabaseConfig(): { url: string; anonKey: string } {
  const env = (import.meta as any).env || {};
  let url = (env.VITE_SUPABASE_URL || 'https://tinrrnfxrbwzrqcyvdlo.supabase.co').trim();
  let anonKey = (env.VITE_SUPABASE_ANON_KEY || '').trim();

  try {
    const saved = localStorage.getItem('accounting_app_settings_v2') || localStorage.getItem('accounting_app_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.supabaseUrl?.trim()) url = parsed.supabaseUrl.trim();
      if (parsed.supabaseAnonKey?.trim()) anonKey = parsed.supabaseAnonKey.trim();
    }
  } catch {}

  return { url, anonKey };
}

let supabaseInstance: SupabaseClient | null = null;
let lastConfigKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getActiveSupabaseConfig();
  if (!url || !anonKey) return null;

  const currentKey = `${url}__${anonKey}`;
  if (supabaseInstance && lastConfigKey === currentKey) return supabaseInstance;

  try {
    supabaseInstance = createClient(url, anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    lastConfigKey = currentKey;
    return supabaseInstance;
  } catch (e) {
    console.warn('Failed to initialize Supabase client:', e);
    return null;
  }
}

export function isSupabaseRealtimeConfigured(): boolean {
  const { url, anonKey } = getActiveSupabaseConfig();
  return Boolean(url && anonKey);
}

/**
 * Fetch all user permissions from Supabase (Primary Database)
 */
export async function fetchPermissionsFromSupabase(): Promise<UserPermission[]> {
  const client = getSupabaseClient();
  
  // 1. Try Supabase JS client if anon key configured
  if (client) {
    try {
      const { data, error } = await client
        .from('user_permissions')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        return formatSupabaseRows(data);
      }
    } catch (err) {
      console.warn('Supabase client fetch error, trying backend API:', err);
    }
  }

  // 2. Fallback to /api/permissions endpoint (works out-of-the-box with SUPABASE_DB_URL)
  try {
    const res = await fetch(`/api/permissions?t=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'success' && Array.isArray(json.data)) {
        return formatSupabaseRows(json.data);
      }
    }
  } catch (err) {
    console.warn('Backend /api/permissions fetch error:', err);
  }

  return [];
}

/**
 * Format raw Supabase rows into UserPermission objects
 */
function formatSupabaseRows(rows: any[]): UserPermission[] {
  return rows.map((r: any) => {
    const email = String(r.email || '').toLowerCase().trim();
    const isMaster = isMasterAdmin(email);
    const role = isMaster ? 'ADMIN' : normalizeUserRole(r.role);

    let viewOnlyOwn = false;
    if (r.viewOnlyOwn !== undefined) {
      viewOnlyOwn = Boolean(r.viewOnlyOwn);
    } else if (r.data_scope || r.dataScope) {
      const scope = String(r.data_scope || r.dataScope).toUpperCase();
      viewOnlyOwn = scope.includes('OWN');
    }

    let allowedPages: NavView[] = isMaster ? [...ALL_CONFIGURABLE_NAV_PAGES] : getDefaultAllowedPages(role);
    const rawPages = r.allowed_pages !== undefined ? r.allowed_pages : r.allowedPages;
    if (Array.isArray(rawPages)) {
      allowedPages = rawPages.filter(Boolean) as NavView[];
    } else if (typeof rawPages === 'string' && rawPages.trim()) {
      if (rawPages.toUpperCase() === 'ALL' || rawPages === '*') {
        allowedPages = [...ALL_CONFIGURABLE_NAV_PAGES];
      } else {
        allowedPages = rawPages.split(',').map((s: string) => s.trim().toUpperCase() as NavView).filter(Boolean);
      }
    }

    return {
      id: r.id || `u-${Date.now()}`,
      email: email,
      name: r.name?.trim() || email.split('@')[0],
      role: role,
      status: isMaster ? 'ACTIVE' : (r.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
      viewOnlyOwn: isMaster ? false : viewOnlyOwn,
      canCreate: isMaster ? true : (r.can_create !== undefined ? Boolean(r.can_create) : (r.canCreate !== undefined ? Boolean(r.canCreate) : true)),
      canEdit: isMaster ? true : (r.can_edit !== undefined ? Boolean(r.can_edit) : (r.canEdit !== undefined ? Boolean(r.canEdit) : false)),
      canDelete: isMaster ? true : (r.can_delete !== undefined ? Boolean(r.can_delete) : (r.canDelete !== undefined ? Boolean(r.canDelete) : false)),
      allowedPages: allowedPages,
      createdAt: r.created_at || r.createdAt || new Date().toISOString(),
      lastLogin: r.last_login || r.lastLogin || undefined,
      updatedAt: r.updated_at || r.updatedAt || undefined
    };
  });
}

/**
 * Save single user permission to Supabase
 */
export async function savePermissionToSupabase(perm: UserPermission): Promise<boolean> {
  const client = getSupabaseClient();
  const cleanEmail = perm.email.toLowerCase().trim();
  const isMaster = isMasterAdmin(cleanEmail);
  const role = isMaster ? 'ADMIN' : normalizeUserRole(perm.role);
  const allowedPages = isMaster ? [...ALL_CONFIGURABLE_NAV_PAGES] : (Array.isArray(perm.allowedPages) ? perm.allowedPages : getDefaultAllowedPages(role));

  const payload = {
    id: perm.id,
    email: cleanEmail,
    name: isMaster ? 'KEUN RATHY' : (perm.name?.trim() || cleanEmail.split('@')[0]),
    role: role,
    status: isMaster ? 'ACTIVE' : perm.status,
    data_scope: isMaster ? 'ALL_DATA' : (perm.viewOnlyOwn ? 'OWN_ONLY' : 'ALL_DATA'),
    can_create: isMaster ? true : (perm.canCreate !== undefined ? Boolean(perm.canCreate) : true),
    can_edit: isMaster ? true : (perm.canEdit !== undefined ? Boolean(perm.canEdit) : false),
    can_delete: isMaster ? true : (perm.canDelete !== undefined ? Boolean(perm.canDelete) : false),
    allowed_pages: allowedPages,
    created_at: perm.createdAt || new Date().toISOString(),
    last_login: perm.lastLogin || null,
    updated_at: new Date().toISOString()
  };

  // 1. Try Supabase client
  if (client) {
    try {
      const { error } = await client
        .from('user_permissions')
        .upsert(payload, { onConflict: 'email' });
      if (!error) return true;
    } catch (err) {
      console.warn('Supabase client save error, trying backend API:', err);
    }
  }

  // 2. Fallback to /api/permissions
  try {
    const res = await fetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', permission: perm })
    });
    return res.ok;
  } catch (err) {
    console.warn('Backend /api/permissions save error:', err);
    return false;
  }
}

/**
 * Bulk sync all permissions to Supabase
 */
export async function syncAllPermissionsToSupabase(perms: UserPermission[]): Promise<boolean> {
  const client = getSupabaseClient();
  
  if (client) {
    try {
      const formatted = perms.map(p => {
        const cleanEmail = p.email.toLowerCase().trim();
        const isMaster = isMasterAdmin(cleanEmail);
        return {
          id: p.id,
          email: cleanEmail,
          name: isMaster ? 'KEUN RATHY' : (p.name?.trim() || cleanEmail.split('@')[0]),
          role: isMaster ? 'ADMIN' : normalizeUserRole(p.role),
          status: isMaster ? 'ACTIVE' : p.status,
          data_scope: isMaster ? 'ALL_DATA' : (p.viewOnlyOwn ? 'OWN_ONLY' : 'ALL_DATA'),
          can_create: isMaster ? true : (p.canCreate !== undefined ? Boolean(p.canCreate) : true),
          can_edit: isMaster ? true : (p.canEdit !== undefined ? Boolean(p.canEdit) : false),
          can_delete: isMaster ? true : (p.canDelete !== undefined ? Boolean(p.canDelete) : false),
          allowed_pages: isMaster ? [...ALL_CONFIGURABLE_NAV_PAGES] : (p.allowedPages || getDefaultAllowedPages(p.role)),
          created_at: p.createdAt || new Date().toISOString(),
          last_login: p.lastLogin || null,
          updated_at: new Date().toISOString()
        };
      });

      const { error } = await client
        .from('user_permissions')
        .upsert(formatted, { onConflict: 'email' });
      if (!error) return true;
    } catch (err) {
      console.warn('Supabase client bulk sync error, trying backend API:', err);
    }
  }

  try {
    const res = await fetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bulk_sync', permissions: perms })
    });
    return res.ok;
  } catch (err) {
    console.warn('Backend /api/permissions bulk_sync error:', err);
    return false;
  }
}

/**
 * Delete permission from Supabase
 */
export async function deletePermissionFromSupabase(email: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  const client = getSupabaseClient();

  if (client) {
    try {
      const { error } = await client
        .from('user_permissions')
        .delete()
        .eq('email', cleanEmail);
      if (!error) return true;
    } catch (err) {
      console.warn('Supabase client delete error, trying backend API:', err);
    }
  }

  try {
    const res = await fetch('/api/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', email: cleanEmail })
    });
    return res.ok;
  } catch (err) {
    console.warn('Backend /api/permissions delete error:', err);
    return false;
  }
}

/**
 * Subscribe to real-time changes in user_permissions table
 */
export function subscribeToSupabasePermissions(
  onUpdate: (permissions: UserPermission[]) => void
): () => void {
  const client = getSupabaseClient();

  if (client) {
    const channel = client
      .channel('public:user_permissions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_permissions' },
        async () => {
          const fresh = await fetchPermissionsFromSupabase();
          if (fresh.length > 0) {
            onUpdate(fresh);
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }

  // Polling fallback when realtime websocket is not connected
  let active = true;
  const interval = setInterval(async () => {
    if (!active) return;
    try {
      const fresh = await fetchPermissionsFromSupabase();
      if (fresh.length > 0) {
        onUpdate(fresh);
      }
    } catch (_) {}
  }, 15000);

  return () => {
    active = false;
    clearInterval(interval);
  };
}
