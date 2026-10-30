import type { FirebaseOptions } from 'firebase/app';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig: FirebaseOptions | null =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  && process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    ? {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      }
    : null;

export const isFirebaseConfigured = firebaseConfig !== null;
export const googleProvider = new GoogleAuthProvider();

let authInstance: ReturnType<typeof getAuth> | null = null;

export function getFirebaseAuth() {
  if (!firebaseConfig) throw new Error('Firebase Web configuration is missing.');
  if (!authInstance) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  }
  return authInstance;
}
