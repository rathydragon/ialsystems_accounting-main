import {
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import { UserActivityLog } from '../types';

const LOGS_COLLECTION = 'activity_logs';
const STORAGE_KEY_LOGS = 'accounting_user_activity_logs_v1';
const MAX_LOGS_LIMIT = 300;

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
 * Record a User Activity Log (Audit Trail)
 */
export async function logUserActivity(
  entry: Omit<UserActivityLog, 'id' | 'timestamp'>
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const id = 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  const fullLog: UserActivityLog = {
    ...entry,
    id,
    timestamp
  };

  // 1. Instant local persistence
  try {
    const saved = localStorage.getItem(STORAGE_KEY_LOGS);
    let list: UserActivityLog[] = [];
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) { }
    }
    list = [fullLog, ...list].slice(0, MAX_LOGS_LIMIT);
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(list));
  } catch (localErr) {
    console.warn('Error saving log to localStorage:', localErr);
  }

  // 2. Real-time Firebase Firestore Sync
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    return false;
  }

  try {
    const docRef = doc(db, LOGS_COLLECTION, id);
    await setDoc(docRef, sanitizeForFirestore(fullLog));
    return true;
  } catch (err) {
    console.warn('Error saving activity log to Firestore:', err);
    return false;
  }
}

/**
 * Subscribe to real-time User Activity Logs from Firestore
 */
export function subscribeToActivityLogs(
  onUpdate: (logs: UserActivityLog[]) => void,
  onError?: (error: any) => void
): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured()) {
    // Return cached local logs if Firebase not active
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LOGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) onUpdate(parsed);
      }
    } catch (e) { }
    return () => {};
  }

  try {
    const colRef = collection(db, LOGS_COLLECTION);
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(MAX_LOGS_LIMIT));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: UserActivityLog[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: d.id || docSnap.id,
            timestamp: d.timestamp || new Date().toISOString(),
            userEmail: d.userEmail || 'unknown@system',
            userName: d.userName || d.userEmail?.split('@')[0] || 'Unknown',
            userRole: d.userRole || 'VIEWER',
            action: d.action || 'LOGIN',
            title: d.title || 'User Action',
            details: d.details || undefined,
            batchNumber: d.batchNumber || undefined,
            amountUSD: d.amountUSD !== undefined ? Number(d.amountUSD) : undefined,
            amountKHR: d.amountKHR !== undefined ? Number(d.amountKHR) : undefined,
            itemsCount: d.itemsCount !== undefined ? Number(d.itemsCount) : undefined
          });
        });

        // Update local cache
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(list));
        onUpdate(list);
      },
      (err) => {
        console.error('Error in Firestore activity logs onSnapshot:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Failed to subscribe to Firestore activity logs:', error);
    if (onError) onError(error);
    return () => {};
  }
}

/**
 * Export Activity Logs to CSV file
 */
export function exportActivityLogsToCSV(logs: UserActivityLog[]) {
  if (!logs || logs.length === 0) return;

  const headers = ['Timestamp,User_Name,User_Email,Role,Action,Batch_Number,Items_Count,USD,KHR,Details'];
  const rows = logs.map(l => {
    const time = l.timestamp ? new Date(l.timestamp).toLocaleString('en-US') : '';
    const name = (l.userName || '').replace(/"/g, '""');
    const email = (l.userEmail || '').replace(/"/g, '""');
    const role = l.userRole || '';
    const action = l.action || '';
    const batch = l.batchNumber || '';
    const count = l.itemsCount ?? '';
    const usd = l.amountUSD ?? '';
    const khr = l.amountKHR ?? '';
    const details = (l.details || l.title || '').replace(/"/g, '""');
    return `"${time}","${name}","${email}","${role}","${action}","${batch}","${count}","${usd}","${khr}","${details}"`;
  });

  const csvContent = '\uFEFF' + headers.concat(rows).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `User_Activity_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
