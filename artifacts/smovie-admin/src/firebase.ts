import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  GithubAuthProvider,
  FacebookAuthProvider,
  setPersistence,
  inMemoryPersistence,
  signInWithPopup, linkWithPopup,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import * as FirebaseAuth from 'firebase/auth';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import configJson from '../firebase-applet-config.json';

// Firebase exposes this helper through its React Native conditional export.
// The Firebase wrapper's browser declaration omits it, so keep the runtime
// lookup typed locally while Metro selects the native implementation.
const getReactNativePersistence = (
  FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
  }
).getReactNativePersistence;

// EXPO_PUBLIC_GOOGLE_API_KEY is inlined by Metro at bundle time.
// Add it to Replit Secrets alongside your Firebase project credentials.
const apiKey: string =
  (process.env.EXPO_PUBLIC_GOOGLE_API_KEY as string | undefined)?.trim() ||
  (Constants.expoConfig?.extra?.firebaseApiKey as string | undefined) ||
  configJson.apiKey.trim();

const firebaseConfig = {
  apiKey,
  authDomain:        configJson.authDomain,
  databaseURL:       (configJson as any).databaseURL,
  projectId:         configJson.projectId,
  storageBucket:     configJson.storageBucket,
  messagingSenderId: configJson.messagingSenderId,
  appId:             configJson.appId,
  measurementId:     configJson.measurementId,
};

let authInstance: Auth | null = null;
let firebaseInitError: Error | null = null;

// Firebase is an optional service for the first render. Never let a malformed
// config, unavailable native storage adapter, or a temporary SDK issue abort
// the entire Android process before the Login screen can render.
try {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  authInstance =
    Platform.OS === 'web'
      ? getAuth(app)
      : initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage) as never,
        });

  if (Platform.OS === 'web') {
    void setPersistence(authInstance, inMemoryPersistence).catch((error) => {
      console.warn('[Firebase Auth] Could not set inMemoryPersistence:', error?.message);
    });
  }
} catch (error) {
  firebaseInitError = error instanceof Error ? error : new Error(String(error));
  console.error('[Firebase] Startup initialization failed:', firebaseInitError.message);
}

export const auth = authInstance;

// True only when a real Firebase Realtime Database URL is present in the config.
// Used to guard getDatabase() calls — calling it with an empty/invalid URL is fatal.
export const hasDatabaseUrl =
  typeof firebaseConfig.databaseURL === 'string' &&
  (firebaseConfig.databaseURL.includes('firebaseio.com') || firebaseConfig.databaseURL.includes('firebasedatabase.app'));

export function getFirebaseInitError(): string {
  return firebaseInitError
    ? `Firebase could not start: ${firebaseInitError.message}`
    : '';
}

export const googleProvider   = new GoogleAuthProvider();
export const githubProvider   = new GithubAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

googleProvider.addScope('profile');
googleProvider.addScope('email');

// popupSignIn: resolves the provider with browserPopupRedirectResolver baked in.
export function linkAccount(user: User, provider: any) { return linkWithPopup(user, provider, browserPopupRedirectResolver); }
export function popupSignIn(
  provider: GoogleAuthProvider | GithubAuthProvider | FacebookAuthProvider,
) {
  if (!authInstance) {
    return Promise.reject(firebaseInitError ?? new Error('Firebase Auth is unavailable.'));
  }
  if (Platform.OS !== 'web') {
    return Promise.reject(
      new Error('Social sign-in is available from the web version of sMovie Admin.'),
    );
  }
  return signInWithPopup(authInstance, provider, browserPopupRedirectResolver);
}

function requireAuth(): Auth {
  if (!authInstance) {
    throw firebaseInitError ?? new Error('Firebase Auth is unavailable.');
  }
  return authInstance;
}

export function signInWithEmailAndPassword(
  _auth: Auth | null,
  email: string,
  password: string,
) {
  return firebaseSignInWithEmailAndPassword(requireAuth(), email, password);
}

export function createUserWithEmailAndPassword(
  _auth: Auth | null,
  email: string,
  password: string,
) {
  return firebaseCreateUserWithEmailAndPassword(requireAuth(), email, password);
}

export function sendPasswordResetEmail(_auth: Auth | null, email: string) {
  return firebaseSendPasswordResetEmail(requireAuth(), email);
}

export function signOut(_auth: Auth | null) {
  return firebaseSignOut(requireAuth());
}

export function onAuthStateChanged(
  _auth: Auth | null,
  callback: (user: User | null) => void,
) {
  if (!authInstance) {
    callback(null);
    return () => {};
  }
  return firebaseOnAuthStateChanged(authInstance, callback);
}

export type { User };
