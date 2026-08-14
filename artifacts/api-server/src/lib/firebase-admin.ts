import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const databaseUrl =
  process.env.FIREBASE_DATABASE_URL ??
  "https://v-cloud-storage-default-rtdb.asia-southeast1.firebasedatabase.app";

let firebaseApp: App | null = null;

function getFirebaseApp(): App | null {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount) return null;
  if (firebaseApp) return firebaseApp;

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(rawServiceAccount) as Record<string, unknown>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid JSON");
  }

  firebaseApp =
    getApps()[0] ??
    initializeApp({
      credential: cert(serviceAccount),
      databaseURL: databaseUrl,
    });
  return firebaseApp;
}

export type LibraryState = {
  items: Array<Record<string, unknown>>;
  categories: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
};

function libraryPath(uid: string): string {
  if (!/^[A-Za-z0-9:_-]+$/.test(uid)) {
    throw new Error("Invalid Firebase user id");
  }
  return `libraries/${uid}`;
}

export async function verifyAdminIdToken(idToken: string): Promise<{ uid: string; email?: string }> {
  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase Admin is not configured");
  }

  const decoded = await getAuth(app).verifyIdToken(idToken);
  return { uid: decoded.uid, email: decoded.email };
}

export async function readAdminLibrary(uid: string): Promise<LibraryState | null> {
  const app = getFirebaseApp();
  if (!app) return null;

  const snapshot = await getDatabase(app).ref(libraryPath(uid)).once("value");
  const value = snapshot.val();
  if (!value || typeof value !== "object") return null;

  return {
    items: Array.isArray(value.items) ? value.items : [],
    categories: Array.isArray(value.categories) ? value.categories.filter((item: unknown): item is string => typeof item === "string") : [],
    metadata: value.metadata && typeof value.metadata === "object" ? value.metadata : {},
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

export async function writeAdminLibrary(uid: string, state: LibraryState): Promise<LibraryState> {
  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase Admin is not configured");
  }

  const nextState: LibraryState = {
    items: state.items,
    categories: [...new Set(state.categories)],
    metadata: state.metadata,
    updatedAt: new Date().toISOString(),
  };
  await getDatabase(app).ref(libraryPath(uid)).set(nextState);
  return nextState;
}

export async function readPublicLibrary(): Promise<LibraryState> {
  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase Admin is not configured");
  }

  const snapshot = await getDatabase(app).ref("libraries").once("value");
  const libraries = snapshot.val();
  const itemsById = new Map<string, Record<string, unknown>>();
  const categories = new Set<string>();

  if (libraries && typeof libraries === "object") {
    for (const value of Object.values(libraries as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const state = value as Partial<LibraryState>;
      if (Array.isArray(state.categories)) {
        state.categories.filter((item): item is string => typeof item === "string").forEach(item => categories.add(item));
      }
      if (!Array.isArray(state.items)) continue;
      for (const item of state.items) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : JSON.stringify(record);
        itemsById.set(id, record);
      }
    }
  }

  return {
    items: [...itemsById.values()],
    categories: [...categories],
    metadata: { source: "firebase-realtime-database" },
    updatedAt: new Date().toISOString(),
  };
}

export async function saveMediaMetadata(
  mediaId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) return false;

  await getDatabase(app).ref(`media/${mediaId}`).set(metadata);
  return true;
}

export async function deleteMediaMetadata(mediaId: string): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) return false;

  await getDatabase(app).ref(`media/${mediaId}`).remove();
  return true;
}