import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';

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

export const DEFAULT_FIREBASE_PROJECT_ID = 'ialexpress';
export const DEFAULT_FIREBASE_API_KEY = 'AIzaSyBNXqK2paVb4pvMfxhCXTD6Xj5kna7ZY6I';
export const DEFAULT_FIREBASE_APP_ID = '1:494989224946:web:590a34eace464d1a82d96b';

/**
 * Get active Firebase Config from Vite env variables, App Settings (localStorage), or built-in defaults
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

  // 3. Fallback to built-in project defaults (ensures Vercel & multi-device instant sync)
  if (DEFAULT_FIREBASE_PROJECT_ID && DEFAULT_FIREBASE_API_KEY) {
    return {
      apiKey: DEFAULT_FIREBASE_API_KEY,
      authDomain: `${DEFAULT_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: DEFAULT_FIREBASE_PROJECT_ID,
      storageBucket: `${DEFAULT_FIREBASE_PROJECT_ID}.appspot.com`,
      messagingSenderId: '',
      appId: DEFAULT_FIREBASE_APP_ID
    };
  }

  return null;
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;
let lastConfigHash: string = '';

export function isFirebaseConfigured(): boolean {
  const config = getActiveFirebaseConfig();
  return !!(config && config.projectId && config.apiKey);
}

export function initFirebase(): { app: FirebaseApp | null; db: Firestore | null; auth: Auth | null } {
  const config = getActiveFirebaseConfig();
  if (!config) {
    return { app: null, db: null, auth: null };
  }

  const currentHash = `${config.projectId}-${config.apiKey}`;
  if (cachedDb && cachedApp && lastConfigHash === currentHash) {
    return { app: cachedApp, db: cachedDb, auth: cachedAuth };
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

    return { app, db, auth: cachedAuth };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return { app: null, db: null, auth: null };
  }
}

export function getDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  return initFirebase().db;
}

export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const env = (import.meta as any).env || {};
  // Only initialize Firebase Auth if explicitly enabled in environment variables.
  // Avoids spawning auth iframe and CONFIGURATION_NOT_FOUND errors when project only uses Firestore & GIS.
  if (env.VITE_ENABLE_FIREBASE_AUTH !== 'true') {
    return null;
  }
  const { app } = initFirebase();
  if (!app) return null;
  try {
    cachedAuth = getAuth(app);
    return cachedAuth;
  } catch (e) {
    console.warn('Firebase Auth initialization skipped:', e);
    return null;
  }
}

/**
 * Authenticate with Firebase Auth using Google OAuth ID token from Google Identity Services
 */
export async function authenticateWithFirebaseGoogleToken(idToken: string) {
  try {
    const auth = getFirebaseAuth();
    if (!auth) return null;
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    return userCredential.user;
  } catch (error: any) {
    console.warn('Firebase Auth signInWithCredential warning (GIS remains active):', error?.message || error);
    return null;
  }
}

/**
 * Sign out from Firebase Auth
 */
export async function firebaseSignOut() {
  try {
    if (cachedAuth) {
      await signOut(cachedAuth);
    }
  } catch (e) {
    console.warn('Firebase signOut error:', e);
  }
}


