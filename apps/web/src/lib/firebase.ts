import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;
export const useEmulators = env.VITE_USE_EMULATORS === 'true';
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'demo-learnchants';

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  appId: env.VITE_FIREBASE_APP_ID || 'demo-app-id',
});

if (env.VITE_APPCHECK_SITE_KEY && typeof window !== 'undefined') {
  if (useEmulators || env.DEV) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(env.VITE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Offline persistence: cached metadata keeps the app usable offline.
export const db = initializeFirestore(app, {
  localCache:
    typeof window !== 'undefined' && 'indexedDB' in window
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : undefined,
  ignoreUndefinedProperties: true,
});


if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
