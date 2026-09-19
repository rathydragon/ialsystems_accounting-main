import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  onSnapshot,
  writeBatch,
  where
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { CollectionBatch, CollectionItem } from '../types';

const BATCHES_COLLECTION = 'batches';

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
 * Subscribe to real-time changes in Batches & Collection Items from Firestore
 */
export function subscribeToBatches(
  onUpdate: (batches: CollectionBatch[]) => void,
  onError?: (error: any) => void
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    console.info('Firebase not configured. Operating in local storage mode.');
    return () => {};
  }

  try {
    const batchesCol = collection(db, BATCHES_COLLECTION);
    const q = query(batchesCol);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const batches: CollectionBatch[] = [];
        snapshot.forEach((docSnap) => {
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

          batches.push({
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
            syncedToGoogle: true
          });
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
        console.error('Error in Firestore batches onSnapshot:', err);
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
 * Save or update a Collection Batch (including its items) in Firestore
 */
export async function saveBatchToFirestore(batch: CollectionBatch): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    console.warn('Firebase not configured. Batch saved locally only.');
    return false;
  }

  const docId = getDocId(batch);
  const docRef = doc(db, BATCHES_COLLECTION, docId);

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
    items: batch.items || []
  });

  await setDoc(docRef, payload, { merge: true });
  return true;
}

/**
 * Delete a specific Collection Batch and its items from Firestore
 */
export async function deleteBatchFromFirestore(idOrBatchNumber: string): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return false;
  }

  const safeId = idOrBatchNumber.replace(/\//g, '_').trim();
  const directDocRef = doc(db, BATCHES_COLLECTION, safeId);

  try {
    await deleteDoc(directDocRef);
  } catch (e) {
    console.warn('Direct doc delete caught, checking queries:', e);
  }

  // Also query if doc was stored under id or batchNumber
  try {
    const batchesCol = collection(db, BATCHES_COLLECTION);
    const q1 = query(batchesCol, where('batchNumber', '==', idOrBatchNumber));
    const snaps = await getDocs(q1);
    const deletePromises: Promise<void>[] = [];
    snaps.forEach((docSnap) => {
      deletePromises.push(deleteDoc(docSnap.ref));
    });

    const q2 = query(batchesCol, where('id', '==', idOrBatchNumber));
    const snaps2 = await getDocs(q2);
    snaps2.forEach((docSnap) => {
      deletePromises.push(deleteDoc(docSnap.ref));
    });

    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error('Error deleting batch from Firestore:', error);
    return false;
  }
}

/**
 * Delete all Collection Batches from Firestore (Admin only)
 */
export async function deleteAllBatchesFromFirestore(): Promise<boolean> {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return false;
  }

  try {
    const batchesCol = collection(db, BATCHES_COLLECTION);
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
