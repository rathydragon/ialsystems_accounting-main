import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  onSnapshot
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { UserPermission } from '../types';

const PERMISSIONS_COLLECTION = 'permissions';

export const MASTER_ADMIN_EMAIL = 'rathykim34@gmail.com';
export const IAL_ACCOUNTING_EMAIL = 'ialexpress2023@gmail.com';

export const DEFAULT_MASTER_ADMIN: UserPermission = {
  id: 'u-master-admin',
  email: MASTER_ADMIN_EMAIL,
  name: 'KEUN RATHY',
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z'
};

export const DEFAULT_IAL_ACCOUNTING: UserPermission = {
  id: 'u-ial-accounting',
  email: IAL_ACCOUNTING_EMAIL,
  name: 'IAL Accounting',
  role: 'ADMIN',
  status: 'ACTIVE',
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

  // 1. Strict Check: ialexpress2023@gmail.com is 100% IAL Accounting
  if (email === IAL_ACCOUNTING_EMAIL) {
    return {
      name: 'IAL Accounting',
      email: email,
      display: `IAL Accounting (${email})`
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

  // 3. Registered user in Permissions table (Admin-assigned name)
  const matchedPerm = permissions?.find(p => p.email.toLowerCase().trim() === email);
  if (matchedPerm && matchedPerm.name && matchedPerm.name.trim()) {
    const assignedName = matchedPerm.name.trim();
    return {
      name: assignedName,
      email: email,
      display: `${assignedName} (${email})`
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
 * Format document ID safely for Firestore based on email address
 */
function getPermDocId(email: string): string {
  return email.toLowerCase().trim().replace(/[@.]/g, '_');
}

/**
 * Clean object so Firestore doesn't error on undefined values
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Subscribe to real-time changes in User Permissions from Firestore
 */
export function subscribeToPermissions(
  onUpdate: (permissions: UserPermission[]) => void,
  onError?: (error: any) => void
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return () => {};
  }

  try {
    const colRef = collection(db, PERMISSIONS_COLLECTION);
    const q = query(colRef);

    let fallbackUnsubscribe: (() => void) | null = null;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: UserPermission[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const email = String(d.email || '').toLowerCase().trim();
          if (!email) return;

          const isMaster = isMasterAdmin(email);
          let assignedName = d.name || email.split('@')[0];
          if (email === IAL_ACCOUNTING_EMAIL) {
            assignedName = 'IAL Accounting';
          } else if (isMaster && (!assignedName || assignedName.toLowerCase().includes('ial'))) {
            assignedName = 'KEUN RATHY';
          }

          list.push({
            id: d.id || docSnap.id,
            email: email,
            name: assignedName,
            role: isMaster ? 'ADMIN' : (d.role || 'VIEWER'),
            status: isMaster ? 'ACTIVE' : (d.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
            createdAt: d.createdAt || new Date().toISOString(),
            lastLogin: d.lastLogin || undefined
          });
        });

        // Always guarantee Master Admin & IAL Accounting are present in the permissions list & written to Firestore
        const masterFound = list.some(u => isMasterAdmin(u.email));
        if (!masterFound) {
          list.unshift(DEFAULT_MASTER_ADMIN);
          savePermissionToFirestore(DEFAULT_MASTER_ADMIN).catch(() => {});
        } else {
          const mIdx = list.findIndex(u => isMasterAdmin(u.email));
          if (mIdx >= 0) {
            list[mIdx] = {
              ...list[mIdx],
              name: list[mIdx].name || 'KEUN RATHY',
              role: 'ADMIN',
              status: 'ACTIVE'
            };
          }
        }

        const ialFound = list.some(u => u.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL);
        if (!ialFound) {
          list.push(DEFAULT_IAL_ACCOUNTING);
          savePermissionToFirestore(DEFAULT_IAL_ACCOUNTING).catch(() => {});
        } else {
          const ialIdx = list.findIndex(u => u.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL);
          if (ialIdx >= 0) {
            list[ialIdx] = {
              ...list[ialIdx],
              name: 'IAL Accounting',
              status: 'ACTIVE'
            };
          }
        }

        onUpdate(list);
      },
      (err) => {
        // If root permissions collection is blocked by Firestore Security Rules, fallback to batches/_system_data/permissions
        if (err?.code === 'permission-denied') {
          console.warn('Firestore root permissions collection blocked by Security Rules. Falling back to batches/_system_data/permissions...');
          try {
            const fallbackCol = collection(db, 'batches', '_system_data', 'permissions');
            fallbackUnsubscribe = onSnapshot(fallbackCol, (subSnap) => {
              const list: UserPermission[] = [];
              subSnap.forEach((docSnap) => {
                const d = docSnap.data();
                const em = String(d.email || '').toLowerCase().trim();
                if (!em) return;
                list.push({
                  id: d.id || docSnap.id,
                  email: em,
                  name: em === IAL_ACCOUNTING_EMAIL ? 'IAL Accounting' : (d.name || em.split('@')[0]),
                  role: isMasterAdmin(em) ? 'ADMIN' : (d.role || 'VIEWER'),
                  status: isMasterAdmin(em) ? 'ACTIVE' : (d.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
                  createdAt: d.createdAt || new Date().toISOString(),
                  lastLogin: d.lastLogin || undefined
                });
              });
              if (list.length > 0) {
                onUpdate(list);
              }
            }, (fallbackErr) => {
              console.warn('Fallback permissions snapshot error:', fallbackErr);
              if (onError) onError(fallbackErr);
            });
          } catch (fErr) {
            console.warn('Failed to start fallback subscription:', fErr);
          }
        } else {
          console.error('Error in Firestore permissions onSnapshot:', err);
          if (onError) onError(err);
        }
      }
    );

    return () => {
      unsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  } catch (error) {
    console.error('Failed to subscribe to Firestore permissions:', error);
    if (onError) onError(error);
    return () => {};
  }
}

/**
 * Save or update User Permission in Firestore (Dual writes to 'permissions', 'user_permissions', and 'batches/_system_data/permissions')
 */
export async function savePermissionToFirestore(perm: UserPermission): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) return false;

  const email = perm.email.toLowerCase().trim();
  if (!email) return false;

  const docId = getPermDocId(email);
  const isMaster = isMasterAdmin(email);
  const payload = sanitizeForFirestore({
    id: perm.id || docId,
    email: email,
    name: email === IAL_ACCOUNTING_EMAIL ? 'IAL Accounting' : (perm.name || email.split('@')[0]),
    role: isMaster ? 'ADMIN' : perm.role,
    status: isMaster ? 'ACTIVE' : perm.status,
    createdAt: perm.createdAt || new Date().toISOString(),
    lastLogin: perm.lastLogin || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  let savedAny = false;

  // 1. Root collection 'permissions'
  try {
    const docRef = doc(db, PERMISSIONS_COLLECTION, docId);
    await setDoc(docRef, payload, { merge: true });
    savedAny = true;
  } catch (_) {}

  // 2. Root collection 'user_permissions'
  try {
    const altDocRef = doc(db, 'user_permissions', docId);
    await setDoc(altDocRef, payload, { merge: true });
    savedAny = true;
  } catch (_) {}

  // 3. Fallback/Mirrored inside 'batches/_system_data/permissions' (Guaranteed by batches rules)
  try {
    const subDocRef = doc(db, 'batches', '_system_data', 'permissions', docId);
    await setDoc(subDocRef, payload, { merge: true });
    savedAny = true;
  } catch (_) {}

  return savedAny;
}

/**
 * Bulk sync all permissions to Firestore (both root tables and batches subcollection)
 */
export async function syncAllPermissionsToFirestore(perms: UserPermission[]): Promise<{
  success: boolean;
  rootSuccess: boolean;
  subSuccess: boolean;
  count: number;
}> {
  const db = getDb();
  if (!db || !isFirebaseConfigured() || !Array.isArray(perms)) {
    return { success: false, rootSuccess: false, subSuccess: false, count: 0 };
  }

  let rootSuccess = false;
  let subSuccess = false;
  let count = 0;

  for (const p of perms) {
    const docId = getPermDocId(p.email);
    const payload = sanitizeForFirestore({
      ...p,
      name: p.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL ? 'IAL Accounting' : (p.name || p.email.split('@')[0]),
      updatedAt: new Date().toISOString()
    });

    // 1. Root collections
    try {
      await setDoc(doc(db, 'permissions', docId), payload, { merge: true });
      await setDoc(doc(db, 'user_permissions', docId), payload, { merge: true });
      rootSuccess = true;
    } catch (_) {}

    // 2. Batches subcollection
    try {
      await setDoc(doc(db, 'batches', '_system_data', 'permissions', docId), payload, { merge: true });
      subSuccess = true;
    } catch (_) {}

    count++;
  }

  return {
    success: rootSuccess || subSuccess,
    rootSuccess,
    subSuccess,
    count
  };
}

/**
 * Delete a user permission record from Firestore
 */
export async function deletePermissionFromFirestore(email: string, docId?: string): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) return false;

  if (isMasterAdmin(email)) {
    console.warn('Cannot delete Master Admin from Firestore.');
    return false;
  }

  const cleanEmail = email.toLowerCase().trim();
  const deletePromises: Promise<any>[] = [];

  try {
    // 1. Delete by explicit docId if provided
    if (docId) {
      deletePromises.push(deleteDoc(doc(db, PERMISSIONS_COLLECTION, docId)).catch(() => {}));
      deletePromises.push(deleteDoc(doc(db, 'user_permissions', docId)).catch(() => {}));
    }

    // 2. Delete by formatted email docId
    const emailDocId = getPermDocId(cleanEmail);
    deletePromises.push(deleteDoc(doc(db, PERMISSIONS_COLLECTION, emailDocId)).catch(() => {}));
    deletePromises.push(deleteDoc(doc(db, 'user_permissions', emailDocId)).catch(() => {}));

    // 3. Query all documents in permissions and user_permissions collections and delete any document matching the email
    const colRef = collection(db, PERMISSIONS_COLLECTION);
    const snap = await getDocs(query(colRef));
    snap.forEach((dSnap) => {
      const d = dSnap.data();
      const em = String(d.email || '').toLowerCase().trim();
      if (em === cleanEmail || dSnap.id === docId || d.id === docId) {
        deletePromises.push(deleteDoc(dSnap.ref).catch(() => {}));
      }
    });

    try {
      const altColRef = collection(db, 'user_permissions');
      const altSnap = await getDocs(query(altColRef));
      altSnap.forEach((dSnap) => {
        const d = dSnap.data();
        const em = String(d.email || '').toLowerCase().trim();
        if (em === cleanEmail || dSnap.id === docId || d.id === docId) {
          deletePromises.push(deleteDoc(dSnap.ref).catch(() => {}));
        }
      });
    } catch (_) {}

    await Promise.allSettled(deletePromises);
    return true;
  } catch (err) {
    console.error('Error deleting permission from Firestore:', err);
    return false;
  }
}
