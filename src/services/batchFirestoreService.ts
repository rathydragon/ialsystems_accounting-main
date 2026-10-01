import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  onSnapshot,
  writeBatch,
  where,
  limit
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { CollectionBatch, CollectionItem } from '../types';

export const BATCHES_COLLECTION = 'batches';
export const MEDICINE_BATCHES_COLLECTION = 'medicine_batches';

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
 * Format document ID safely for Firestore
 */
function getDocId(batch: Partial<CollectionBatch>): string {
  const rawId = (batch.batchNumber || batch.id || `batch-${Date.now()}`).trim();
  // Replace slashes which are invalid in Firestore doc IDs
  return rawId.replace(/\//g, '_');
}

/**
 * Parse document snapshot into typed CollectionBatch
 */
function parseBatchDoc(docSnap: any): CollectionBatch {
  const d = docSnap.data();
  const items: CollectionItem[] = Array.isArray(d.items)
    ? d.items.map((it: any, idx: number) => ({
        id: it.id || `item-${docSnap.id}-${idx}`,
        tracking: it.tracking || '',
        name: it.name || '',
        paymentMethod: it.paymentMethod || 'CASH',
        usd: Number(it.usd) || 0,
        khm: Number(it.khm) || 0,
        date: it.date || '',
        createdAt: it.createdAt || '',
        note: it.note || ''
      }))
    : [];

  let opName = d.operator || 'Unknown';
  const opEmail = String(d.operatorEmail || '').toLowerCase().trim();
  if (opEmail === 'ialexpress2023@gmail.com') {
    opName = 'IAL Accounting';
  }

  return {
    id: d.id || docSnap.id,
    batchNumber: d.batchNumber || docSnap.id,
    operator: opName,
    operatorEmail: opEmail,
    totalItems: Number(d.totalItems) || items.length,
    totalUSD: Number(d.totalUSD) || 0,
    totalKHR: Number(d.totalKHR) || 0,
    bankUSD: Number(d.bankUSD) || 0,
    bankKHR: Number(d.bankKHR) || 0,
    cashUSD: Number(d.cashUSD) || 0,
    cashKHR: Number(d.cashKHR) || 0,
    reconciliation: d.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)',
    reconciliationStatus: d.reconciliationStatus,
    diffUSD: d.diffUSD,
    diffKHR: d.diffKHR,
    notes: d.notes || '',
    createdAt: d.createdAt || new Date().toISOString(),
    items: items,
    syncedToGoogle: true,
    isDeleted: d.isDeleted === true,
    deletedAt: d.deletedAt || undefined,
    deletedBy: d.deletedBy || undefined
  };
}

/**
 * Subscribe to real-time changes in Batches & Collection Items from Firestore
 * Optimized with pagination limit and filters out soft-deleted items by default
 */
export function subscribeToBatches(
  onUpdate: (batches: CollectionBatch[]) => void,
  onError?: (error: any) => void,
  collectionName: string = BATCHES_COLLECTION,
  fetchLimit: number = 300
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    console.info('Firebase not configured. Operating in local storage mode.');
    return () => {};
  }

  try {
    const batchesCol = collection(db, collectionName);
    // Apply limit to prevent unbounded memory & excessive read quota consumption
    const q = query(batchesCol, limit(fetchLimit));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const batches: CollectionBatch[] = [];
        snapshot.forEach((docSnap) => {
          const batch = parseBatchDoc(docSnap);
          // Hide soft-deleted records from active list
          if (!batch.isDeleted) {
            batches.push(batch);
          }
        });

        // Sort latest first by createdAt or batchNumber
        batches.sort((a, b) => {
          const tA = new Date(a.createdAt).getTime() || 0;
          const tB = new Date(b.createdAt).getTime() || 0;
          return tB - tA;
        });

        onUpdate(batches);
      },
      (err) => {
        if (err?.code === 'permission-denied') {
          console.warn(`Firestore [${collectionName}] permission notice: Missing or insufficient permissions in Firebase Console. Operating in local storage mode.`);
        } else {
          console.error('Error in Firestore batches onSnapshot:', err);
        }
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Failed to subscribe to Firestore batches:', error);
    if (onError) onError(error);
    return () => {};
  }
}

/**
 * Subscribe to soft-deleted Batches (Recycle Bin / ធុងសំរាម)
 */
export function subscribeToDeletedBatches(
  onUpdate: (batches: CollectionBatch[]) => void,
  onError?: (error: any) => void,
  collectionName: string = BATCHES_COLLECTION
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return () => {};
  }

  try {
    const batchesCol = collection(db, collectionName);
    const q = query(batchesCol, limit(150));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const deletedBatches: CollectionBatch[] = [];
        snapshot.forEach((docSnap) => {
          const batch = parseBatchDoc(docSnap);
          if (batch.isDeleted) {
            deletedBatches.push(batch);
          }
        });

        deletedBatches.sort((a, b) => {
          const tA = new Date(a.deletedAt || a.createdAt).getTime() || 0;
          const tB = new Date(b.deletedAt || b.createdAt).getTime() || 0;
          return tB - tA;
        });

        onUpdate(deletedBatches);
      },
      (err) => {
        console.warn('Error fetching deleted batches:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (e) {
    return () => {};
  }
}

/**
 * Save or update a Collection Batch in Firestore
 */
export async function saveBatchToFirestore(
  batch: CollectionBatch,
  collectionName: string = BATCHES_COLLECTION
): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    console.warn('Firebase not configured. Batch saved locally only.');
    return false;
  }

  const docId = getDocId(batch);
  const docRef = doc(db, collectionName, docId);

  const opEmail = String(batch.operatorEmail || '').toLowerCase().trim();
  let opName = batch.operator || 'Unknown';
  if (opEmail === 'ialexpress2023@gmail.com') {
    opName = 'IAL Accounting';
  }

  const payload = sanitizeForFirestore({
    id: batch.id || docId,
    batchNumber: batch.batchNumber || docId,
    operator: opName,
    operatorEmail: opEmail,
    totalItems: batch.totalItems || (batch.items ? batch.items.length : 0),
    totalUSD: batch.totalUSD || 0,
    totalKHR: batch.totalKHR || 0,
    bankUSD: batch.bankUSD || 0,
    bankKHR: batch.bankKHR || 0,
    cashUSD: batch.cashUSD || 0,
    cashKHR: batch.cashKHR || 0,
    reconciliation: batch.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)',
    reconciliationStatus: batch.reconciliationStatus || null,
    diffUSD: batch.diffUSD || 0,
    diffKHR: batch.diffKHR || 0,
    notes: batch.notes || '',
    createdAt: batch.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: batch.items || [],
    isDeleted: batch.isDeleted === true,
    deletedAt: batch.deletedAt || null,
    deletedBy: batch.deletedBy || null
  });

  await setDoc(docRef, payload, { merge: true });
  return true;
}

/**
 * Delete a specific Collection Batch (Supports Soft Delete by default to protect from accidental loss)
 */
export async function deleteBatchFromFirestore(
  idOrBatchNumber: string,
  collectionName: string = BATCHES_COLLECTION,
  softDelete: boolean = true,
  deletedBy?: string
): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return false;
  }

  const safeId = idOrBatchNumber.replace(/\//g, '_').trim();
  const directDocRef = doc(db, collectionName, safeId);

  try {
    if (softDelete) {
      // Soft Delete: Mark as deleted so it can be restored from Recycle Bin
      await setDoc(directDocRef, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: deletedBy || 'User'
      }, { merge: true });
      return true;
    } else {
      // Permanent Hard Delete
      await deleteDoc(directDocRef);
    }
  } catch (e) {
    console.warn('Direct doc delete caught, checking queries:', e);
  }

  // Also query if doc was stored under id or batchNumber
  try {
    const batchesCol = collection(db, collectionName);
    const q1 = query(batchesCol, where('batchNumber', '==', idOrBatchNumber));
    const snaps = await getDocs(q1);
    const promises: Promise<void>[] = [];
    snaps.forEach((docSnap) => {
      if (softDelete) {
        promises.push(setDoc(docSnap.ref, {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: deletedBy || 'User'
        }, { merge: true }));
      } else {
        promises.push(deleteDoc(docSnap.ref));
      }
    });

    const q2 = query(batchesCol, where('id', '==', idOrBatchNumber));
    const snaps2 = await getDocs(q2);
    snaps2.forEach((docSnap) => {
      if (softDelete) {
        promises.push(setDoc(docSnap.ref, {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: deletedBy || 'User'
        }, { merge: true }));
      } else {
        promises.push(deleteDoc(docSnap.ref));
      }
    });

    await Promise.all(promises);
    return true;
  } catch (error) {
    console.error('Error deleting batch from Firestore:', error);
    return false;
  }
}

/**
 * Restore a soft-deleted batch from Recycle Bin
 */
export async function restoreBatchFromFirestore(
  idOrBatchNumber: string,
  collectionName: string = BATCHES_COLLECTION
): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return false;
  }

  const safeId = idOrBatchNumber.replace(/\//g, '_').trim();
  const directDocRef = doc(db, collectionName, safeId);

  try {
    await setDoc(directDocRef, {
      isDeleted: false,
      restoredAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('Error restoring batch:', e);
    return false;
  }
}

/**
 * Delete all Collection Batches from Firestore (Admin only)
 */
export async function deleteAllBatchesFromFirestore(
  collectionName: string = BATCHES_COLLECTION
): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return false;
  }

  try {
    const batchesCol = collection(db, collectionName);
    const snapshot = await getDocs(batchesCol);

    if (snapshot.empty) return true;

    // Batched writes support up to 500 operations per batch
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batchOp = writeBatch(db);
      const chunk = docs.slice(i, i + 400);
      chunk.forEach((d) => batchOp.delete(d.ref));
      await batchOp.commit();
    }

    return true;
  } catch (error) {
    console.error('Error deleting all batches from Firestore:', error);
    return false;
  }
}

// Dedicated Medicine Batches Firestore Helpers
export const subscribeToMedicineBatches = (
  onUpdate: (batches: CollectionBatch[]) => void,
  onError?: (error: any) => void,
  fetchLimit: number = 300
) => subscribeToBatches(onUpdate, onError, MEDICINE_BATCHES_COLLECTION, fetchLimit);

export const saveMedicineBatchToFirestore = (batch: CollectionBatch) =>
  saveBatchToFirestore(batch, MEDICINE_BATCHES_COLLECTION);

export const deleteMedicineBatchFromFirestore = (
  idOrBatchNumber: string,
  softDelete: boolean = true,
  deletedBy?: string
) => deleteBatchFromFirestore(idOrBatchNumber, MEDICINE_BATCHES_COLLECTION, softDelete, deletedBy);

export const restoreMedicineBatchFromFirestore = (idOrBatchNumber: string) =>
  restoreBatchFromFirestore(idOrBatchNumber, MEDICINE_BATCHES_COLLECTION);

export const deleteAllMedicineBatchesFromFirestore = () =>
  deleteAllBatchesFromFirestore(MEDICINE_BATCHES_COLLECTION);
