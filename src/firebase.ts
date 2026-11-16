import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
} from 'firebase/storage';

interface FirebaseClientConfig {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

const configModules = import.meta.glob('../firebase-applet-config.json', {
  eager: true,
}) as Record<string, { default?: FirebaseClientConfig } | FirebaseClientConfig>;

const rawModule = configModules['../firebase-applet-config.json'];
const firebaseConfig: FirebaseClientConfig =
  rawModule && 'default' in rawModule && rawModule.default
    ? rawModule.default
    : ((rawModule as FirebaseClientConfig) || {});

export const isFirebaseConfigured = Boolean(
  firebaseConfig.projectId &&
    firebaseConfig.apiKey &&
    firebaseConfig.appId &&
    firebaseConfig.projectId !== 'remixed-project-id',
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
  auth = getAuth(app);
  storage = firebaseConfig.storageBucket ? getStorage(app) : null;
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
}

export const isFirebaseStorageConfigured = Boolean(
  isFirebaseConfigured && firebaseConfig.storageBucket && storage,
);

export { app, db, auth, storage, googleProvider };

export function getFirebasePublicMeta() {
  return {
    configured: isFirebaseConfigured,
    storageConfigured: isFirebaseStorageConfigured,
    projectId: firebaseConfig.projectId || '',
    databaseId: firebaseConfig.firestoreDatabaseId || '',
    authDomain: firebaseConfig.authDomain || '',
    storageBucket: firebaseConfig.storageBucket || '',
  };
}

export async function uploadMediaFileToFirebaseStorage(
  file: File,
  folder: 'audio' | 'video' | 'artwork',
  onProgress?: (pct: number) => void,
  accessTier: 'free' | 'premium' = 'free',
): Promise<{ url: string; storagePath: string }> {
  if (accessTier === 'premium') {
    throw new Error('PREMIUM_MEDIA_REQUIRES_BACKEND_STREAMING');
  }
  if (!storage || !isFirebaseStorageConfigured) {
    throw new Error('FIREBASE_STORAGE_NOT_CONFIGURED');
  }

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
  const ext = extMatch ? extMatch[1].toLowerCase() : folder === 'video' ? 'mp4' : folder === 'artwork' ? 'jpg' : 'mp3';
  const baseName = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60) || 'media';
  const rand = Math.random().toString(36).slice(2, 8);
  const storagePath = `stories/free/${folder}/${baseName}_${Date.now()}_${rand}.${ext}`;
  const storageRef = ref(storage, storagePath);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type || undefined,
      cacheControl: 'public, max-age=31536000',
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && onProgress) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (error) => {
        reject(error);
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ url, storagePath });
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<{
  connected: boolean;
  message: string;
}> {
  if (!db) {
    return { connected: false, message: 'Firebase Firestore configured নয়।' };
  }
  try {
    await getDocFromServer(doc(db, 'categories', 'audio'));
    return { connected: true, message: 'Firestore সার্ভারের সাথে সরাসরি সংযুক্ত' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline') || msg.includes('unavailable')) {
      console.error('Please check your Firebase configuration.');
      return { connected: false, message: 'Firestore অফলাইন বা সংযোগ পাওয়া যাচ্ছে না।' };
    }
    return {
      connected: true,
      message: 'Firestore সার্ভার সচল আছে (নিরাপত্তা নীতি সক্রিয়)।',
    };
  }
}

async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (isFirebaseConfigured) {
  void testConnection();
}
