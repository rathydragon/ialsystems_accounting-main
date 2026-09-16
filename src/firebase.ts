import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const STORAGE_KEY_SETTINGS = 'accounting_app_settings_v2';
const STORAGE_KEY_SETTINGS_ALT = 'accounting_app_settings_v3';

/**
 * Get active Firebase Config from Vite env variables or App Settings (localStorage)
 */
export function getActiveFirebaseConfig(): FirebaseConfig | null {
  // 1. Check localStorage settings
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS) || localStorage.getItem(STORAGE_KEY_SETTINGS_ALT);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.firebaseProjectId && parsed.firebaseApiKey) {
        return {
          apiKey: parsed.firebaseApiKey.trim(),
          authDomain: (parsed.firebaseAuthDomain || `${parsed.firebaseProjectId.trim()}.firebaseapp.com`).trim(),
          projectId: parsed.firebaseProjectId.trim(),
          storageBucket: (parsed.firebaseStorageBucket || `${parsed.firebaseProjectId.trim()}.appspot.com`).trim(),
          messagingSenderId: (parsed.firebaseMessagingSenderId || '').trim(),
          appId: (parsed.firebaseAppId || '').trim()
        };
      }
    }
  } catch (e) {
    console.warn('Error reading Firebase config from settings:', e);
  }

  // 2. Check Vite .env variables
  const env = (import.meta as any).env || {};
  if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: (env.VITE_FIREBASE_API_KEY || '').trim(),
      authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`).trim(),
      projectId: (env.VITE_FIREBASE_PROJECT_ID || '').trim(),
      storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com`).trim(),
      messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
      appId: (env.VITE_FIREBASE_APP_ID || '').trim()
    };
  }

  return null;
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let lastConfigHash: string = '';

export function isFirebaseConfigured(): boolean {
  const config = getActiveFirebaseConfig();
  return !!(config && config.projectId && config.apiKey);
}

export function initFirebase(): { app: FirebaseApp | null; db: Firestore | null } {
  const config = getActiveFirebaseConfig();
  if (!config) {
    return { app: null, db: null };
  }

  const currentHash = `${config.projectId}-${config.apiKey}`;
  if (cachedDb && cachedApp && lastConfigHash === currentHash) {
    return { app: cachedApp, db: cachedDb };
  }

  try {
    const existingApps = getApps();
    let app: FirebaseApp;
    if (existingApps.length > 0) {
      app = getApp();
    } else {
      app = initializeApp(config);
    }
    const db = getFirestore(app);

    cachedApp = app;
    cachedDb = db;
    lastConfigHash = currentHash;

    return { app, db };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return { app: null, db: null };
  }
}

export function getDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  return initFirebase().db;
}
