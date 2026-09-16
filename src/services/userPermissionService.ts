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

export const DEFAULT_MASTER_ADMIN: UserPermission = {
  id: 'u-master-admin',
  email: MASTER_ADMIN_EMAIL,
  name: 'Rathy Kim',
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z'
};

export function isMasterAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === MASTER_ADMIN_EMAIL;
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

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: UserPermission[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          const email = String(d.email || '').toLowerCase().trim();
          if (!email) return;

          const isMaster = isMasterAdmin(email);
          list.push({
            id: d.id || docSnap.id,
            email: email,
            name: d.name || email.split('@')[0],
            role: isMaster ? 'ADMIN' : (d.role || 'VIEWER'),
            status: isMaster ? 'ACTIVE' : (d.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
            createdAt: d.createdAt || new Date().toISOString(),
            lastLogin: d.lastLogin || undefined
          });
        });

        // Always guarantee Master Admin is present in the permissions list
        const masterFound = list.some(u => isMasterAdmin(u.email));
        if (!masterFound) {
          list.unshift(DEFAULT_MASTER_ADMIN);
        } else {
          const mIdx = list.findIndex(u => isMasterAdmin(u.email));
          if (mIdx >= 0) {
            list[mIdx] = {
              ...list[mIdx],
              role: 'ADMIN',
              status: 'ACTIVE'
            };
          }
        }

        onUpdate(list);
      },
      (err) => {
        console.error('Error in Firestore permissions onSnapshot:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Failed to subscribe to Firestore permissions:', error);
    if (onError) onError(error);
    return () => {};
  }
}

/**
 * Save or update User Permission in Firestore
 */
export async function savePermissionToFirestore(perm: UserPermission): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) return false;

  const email = perm.email.toLowerCase().trim();
  if (!email) return false;

  const docId = getPermDocId(email);
  const docRef = doc(db, PERMISSIONS_COLLECTION, docId);

  const isMaster = isMasterAdmin(email);
  const payload = sanitizeForFirestore({
    id: perm.id || docId,
    email: email,
    name: perm.name || email.split('@')[0],
    role: isMaster ? 'ADMIN' : perm.role,
    status: isMaster ? 'ACTIVE' : perm.status,
    createdAt: perm.createdAt || new Date().toISOString(),
    lastLogin: perm.lastLogin || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  try {
    await setDoc(docRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving permission to Firestore:', err);
    return false;
  }
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
    }

    // 2. Delete by formatted email docId
    const emailDocId = getPermDocId(cleanEmail);
    deletePromises.push(deleteDoc(doc(db, PERMISSIONS_COLLECTION, emailDocId)).catch(() => {}));

    // 3. Query all documents in permissions collection and delete any document matching the email
    const colRef = collection(db, PERMISSIONS_COLLECTION);
    const snap = await getDocs(query(colRef));
    snap.forEach((dSnap) => {
      const d = dSnap.data();
      const em = String(d.email || '').toLowerCase().trim();
      if (em === cleanEmail || dSnap.id === docId || d.id === docId) {
        deletePromises.push(deleteDoc(dSnap.ref).catch(() => {}));
      }
    });

    await Promise.allSettled(deletePromises);
    return true;
  } catch (err) {
    console.error('Error deleting permission from Firestore:', err);
    return false;
  }
}
