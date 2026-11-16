import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applicationDefault, getApps, initializeApp, type App as AdminApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import {
  getMessaging,
  type Messaging,
  type MulticastMessage,
} from 'firebase-admin/messaging';
import { getFirebaseRuntimeConfig } from './firebaseAuth.ts';
import { getCloudMetadataAccessToken } from './firestoreSync.ts';
import type { Language } from '../src/types/content.ts';

export interface StoredFcmTokenRecord {
  uid: string;
  tokenId: string;
  token: string;
  platform: 'web' | 'android' | 'ios';
  language: Language;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SendPushInput {
  targetUid?: string;
  targetEmail?: string;
  targetToken?: string;
  title: string;
  body: string;
  link?: string;
  imageUrl?: string;
  storyId?: string;
}

export interface SendPushResult {
  targetCount: number;
  sentCount: number;
  failureCount: number;
  removedInvalidTokens: number;
  usedLiveAdminSdk: boolean;
  warnings: string[];
  results: Array<{
    tokenPreview: string;
    uid?: string;
    success: boolean;
    messageId?: string;
    errorCode?: string;
    errorMessage?: string;
  }>;
}

export interface MessagingAdapter {
  sendEachForMulticast(message: MulticastMessage): Promise<{
    successCount: number;
    failureCount: number;
    responses: Array<{
      success: boolean;
      messageId?: string;
      error?: { code?: string; message?: string };
    }>;
  }>;
}

const ADMIN_APP_NAME = 'goppo-kahini-fcm-admin';
let cachedAdminApp: AdminApp | null = null;
let adminInitError: string | null = null;

async function hasAvailableGoogleAdc(disableLiveFirebaseAdmin?: boolean): Promise<boolean> {
  if (disableLiveFirebaseAdmin) {
    return false;
  }
  const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);

  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (credPath) {
    try {
      if (fs.existsSync(credPath)) return true;
    } catch {
      // Ignore invalid path
    }
  }

  const wellKnownAdc = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json')
    : path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
  try {
    if (fs.existsSync(wellKnownAdc)) return true;
  } catch {
    // Ignore
  }

  if (isCloudRun) {
    return true;
  }

  const metaToken = await getCloudMetadataAccessToken().catch(() => null);
  return Boolean(metaToken);
}

function getOrInitAdminApp(): AdminApp | null {
  if (cachedAdminApp) return cachedAdminApp;
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) {
    cachedAdminApp = existing;
    return cachedAdminApp;
  }

  const { projectId } = getFirebaseRuntimeConfig();
  if (!projectId) {
    adminInitError = 'FIREBASE_PROJECT_ID is not configured.';
    return null;
  }

  try {
    cachedAdminApp = initializeApp(
      {
        projectId,
        credential: applicationDefault(),
      },
      ADMIN_APP_NAME,
    );
    adminInitError = null;
    return cachedAdminApp;
  } catch (err) {
    adminInitError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

async function getAdminFirestore(disableLiveFirebaseAdmin?: boolean): Promise<AdminFirestore | null> {
  if (!(await hasAvailableGoogleAdc(disableLiveFirebaseAdmin))) {
    return null;
  }
  const adminApp = getOrInitAdminApp();
  if (!adminApp) return null;
  const { databaseId } = getFirebaseRuntimeConfig();
  try {
    return databaseId && databaseId !== '(default)'
      ? getFirestore(adminApp, databaseId)
      : getFirestore(adminApp);
  } catch (err) {
    adminInitError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

async function getAdminMessaging(disableLiveFirebaseAdmin?: boolean): Promise<Messaging | null> {
  if (!(await hasAvailableGoogleAdc(disableLiveFirebaseAdmin))) {
    adminInitError =
      'Google Application Default Credentials (Cloud Run Service Account or GOOGLE_APPLICATION_CREDENTIALS) unavailable.';
    return null;
  }
  const adminApp = getOrInitAdminApp();
  if (!adminApp) return null;
  try {
    return getMessaging(adminApp);
  } catch (err) {
    adminInitError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

export function computeServerFcmTokenId(token: string): string {
  const hash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  return `fcm_${hash.slice(0, 40)}`;
}

export function maskFcmToken(token: string): string {
  const clean = token.trim();
  if (clean.length <= 16) return '***';
  return `${clean.slice(0, 10)}...${clean.slice(-6)}`;
}

function sanitizeNotificationLink(raw?: string): string {
  const trimmed = (raw || '/').trim();
  if (!trimmed) return '/';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed.slice(0, 300);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString().slice(0, 300);
    }
  } catch {
    // Fallback to home
  }
  return '/';
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export function createFcmNotificationService(options: {
  localTokensByUser: Record<string, StoredFcmTokenRecord[]>;
  saveLocalState: () => void;
  findUidByEmail: (email: string) => Promise<string | null>;
  messagingOverride?: MessagingAdapter;
  disableLiveFirebaseAdmin?: boolean;
}) {
  const upsertLocalToken = (record: StoredFcmTokenRecord) => {
    const list = options.localTokensByUser[record.uid] || [];
    const filtered = list.filter(
      (item) => item.tokenId !== record.tokenId && item.token !== record.token,
    );
    filtered.unshift(record);
    options.localTokensByUser[record.uid] = filtered.slice(0, 20);
    options.saveLocalState();
  };

  const removeLocalTokenByValue = (token: string, uid?: string) => {
    let changed = false;
    const targetUids = uid ? [uid] : Object.keys(options.localTokensByUser);
    for (const userId of targetUids) {
      const list = options.localTokensByUser[userId];
      if (!list) continue;
      const next = list.filter((item) => item.token !== token);
      if (next.length !== list.length) {
        if (next.length === 0) {
          delete options.localTokensByUser[userId];
        } else {
          options.localTokensByUser[userId] = next;
        }
        changed = true;
      }
    }
    if (changed) options.saveLocalState();
  };

  async function registerUserToken(input: {
    uid: string;
    token: string;
    platform?: 'web' | 'android' | 'ios';
    language?: Language;
    userAgent?: string;
  }): Promise<{ tokenId: string; firestoreSynced: boolean }> {
    const uid = input.uid.trim();
    const token = input.token.trim();
    const tokenId = computeServerFcmTokenId(token);
    const nowIso = new Date().toISOString();

    const record: StoredFcmTokenRecord = {
      uid,
      tokenId,
      token,
      platform: input.platform || 'web',
      language: input.language === 'hi' ? 'hi' : 'bn',
      userAgent: input.userAgent ? input.userAgent.slice(0, 300) : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    upsertLocalToken(record);

    let firestoreSynced = false;
    const adminDb = await getAdminFirestore(options.disableLiveFirebaseAdmin);
    if (adminDb) {
      try {
        const docRef = adminDb.collection('users').doc(uid).collection('fcmTokens').doc(tokenId);
        const snap = await docRef.get().catch(() => null);
        await docRef.set({
          uid,
          token,
          platform: record.platform,
          language: record.language,
          ...(record.userAgent ? { userAgent: record.userAgent } : {}),
          createdAt:
            snap && snap.exists && snap.data()?.createdAt
              ? snap.data()?.createdAt
              : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        firestoreSynced = true;
      } catch {
        // Non-blocking if running without GCP IAM / ADC locally
      }
    }

    return { tokenId, firestoreSynced };
  }

  async function unregisterUserToken(uid: string, token: string): Promise<void> {
    const cleanToken = token.trim();
    const tokenId = computeServerFcmTokenId(cleanToken);
    removeLocalTokenByValue(cleanToken, uid);

    const adminDb = await getAdminFirestore(options.disableLiveFirebaseAdmin);
    if (adminDb) {
      try {
        await adminDb.collection('users').doc(uid).collection('fcmTokens').doc(tokenId).delete();
      } catch {
        // Ignore if missing or unavailable locally
      }
    }
  }

  async function collectTokensForUid(uid: string): Promise<StoredFcmTokenRecord[]> {
    const byToken = new Map<string, StoredFcmTokenRecord>();
    for (const rec of options.localTokensByUser[uid] || []) {
      byToken.set(rec.token, rec);
    }

    const adminDb = await getAdminFirestore(options.disableLiveFirebaseAdmin);
    if (adminDb) {
      try {
        const snap = await adminDb.collection('users').doc(uid).collection('fcmTokens').get();
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (typeof data.token === 'string' && data.token.length >= 10) {
            byToken.set(data.token, {
              uid,
              tokenId: docSnap.id,
              token: data.token,
              platform: (data.platform as 'web' | 'android' | 'ios') || 'web',
              language: data.language === 'hi' ? 'hi' : 'bn',
              userAgent: typeof data.userAgent === 'string' ? data.userAgent : undefined,
              createdAt: String(data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString()),
              updatedAt: String(data.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString()),
            });
          }
        });
      } catch {
        // Keep local fallback records
      }
    }
    return Array.from(byToken.values());
  }

  async function collectAllTokens(): Promise<StoredFcmTokenRecord[]> {
    const byToken = new Map<string, StoredFcmTokenRecord>();
    for (const list of Object.values(options.localTokensByUser)) {
      for (const rec of list) {
        byToken.set(rec.token, rec);
      }
    }

    const adminDb = await getAdminFirestore(options.disableLiveFirebaseAdmin);
    if (adminDb) {
      try {
        const snap = await adminDb.collectionGroup('fcmTokens').get();
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const uid = typeof data.uid === 'string' ? data.uid : docSnap.ref.parent.parent?.id || '';
          if (uid && typeof data.token === 'string' && data.token.length >= 10) {
            byToken.set(data.token, {
              uid,
              tokenId: docSnap.id,
              token: data.token,
              platform: (data.platform as 'web' | 'android' | 'ios') || 'web',
              language: data.language === 'hi' ? 'hi' : 'bn',
              userAgent: typeof data.userAgent === 'string' ? data.userAgent : undefined,
              createdAt: String(data.createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString()),
              updatedAt: String(data.updatedAt?.toDate?.()?.toISOString?.() || new Date().toISOString()),
            });
          }
        });
      } catch {
        // Keep local fallback records
      }
    }
    return Array.from(byToken.values());
  }

  async function listTokenSummaries(): Promise<
    Array<{
      uid: string;
      tokenId: string;
      tokenPreview: string;
      platform: string;
      language: Language;
      updatedAt: string;
    }>
  > {
    const all = await collectAllTokens();
    return all.map((r) => ({
      uid: r.uid,
      tokenId: r.tokenId,
      tokenPreview: maskFcmToken(r.token),
      platform: r.platform,
      language: r.language,
      updatedAt: r.updatedAt,
    }));
  }

  async function sendPushNotification(input: SendPushInput): Promise<SendPushResult> {
    const title = (input.title || '').trim().slice(0, 120);
    const body = (input.body || '').trim().slice(0, 500);
    if (!title || !body) {
      throw new Error('Notification title and body are required.');
    }
    const link = sanitizeNotificationLink(input.link);

    let targets: StoredFcmTokenRecord[] = [];
    const warnings: string[] = [];

    if (input.targetToken && input.targetToken.trim().length >= 10) {
      const clean = input.targetToken.trim();
      targets = [
        {
          uid: input.targetUid?.trim() || 'direct_token',
          tokenId: computeServerFcmTokenId(clean),
          token: clean,
          platform: 'web',
          language: 'bn',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    } else if (input.targetUid && input.targetUid.trim()) {
      targets = await collectTokensForUid(input.targetUid.trim());
    } else if (input.targetEmail && input.targetEmail.trim()) {
      const resolvedUid = await options.findUidByEmail(input.targetEmail.trim().toLowerCase());
      if (resolvedUid) {
        targets = await collectTokensForUid(resolvedUid);
      } else {
        warnings.push(`No account UID resolved for email: ${input.targetEmail.trim()}`);
      }
    } else {
      targets = await collectAllTokens();
    }

    if (targets.length === 0) {
      return {
        targetCount: 0,
        sentCount: 0,
        failureCount: 0,
        removedInvalidTokens: 0,
        usedLiveAdminSdk:
          !options.messagingOverride &&
          !options.disableLiveFirebaseAdmin &&
          Boolean(await getAdminMessaging(options.disableLiveFirebaseAdmin)),
        warnings: [
          ...warnings,
          'No registered FCM device tokens found for the selected target.',
        ],
        results: [],
      };
    }

    const messaging =
      options.messagingOverride || (await getAdminMessaging(options.disableLiveFirebaseAdmin));
    if (!messaging) {
      throw new Error(
        `Firebase Admin Messaging is not initialized (${adminInitError || 'Application Default Credentials unavailable'}).`,
      );
    }

    let sentCount = 0;
    let failureCount = 0;
    let removedInvalidTokens = 0;
    const results: SendPushResult['results'] = [];

    for (let i = 0; i < targets.length; i += 500) {
      const chunk = targets.slice(i, i + 500);
      const multicast: MulticastMessage = {
        tokens: chunk.map((t) => t.token),
        notification: {
          title,
          body,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        },
        data: {
          title,
          body,
          url: link,
          ...(input.storyId ? { storyId: input.storyId } : {}),
        },
        webpush: {
          notification: {
            title,
            body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            ...(input.imageUrl ? { image: input.imageUrl } : {}),
          },
          fcmOptions: {
            link,
          },
        },
      };

      const batchResp = await messaging.sendEachForMulticast(multicast);
      sentCount += batchResp.successCount;
      failureCount += batchResp.failureCount;

      for (let idx = 0; idx < chunk.length; idx += 1) {
        const targetRec = chunk[idx];
        const itemResp = batchResp.responses[idx];
        if (itemResp?.success) {
          results.push({
            tokenPreview: maskFcmToken(targetRec.token),
            uid: targetRec.uid,
            success: true,
            messageId: itemResp.messageId,
          });
        } else {
          const code = itemResp?.error?.code || 'messaging/unknown-error';
          const message = itemResp?.error?.message || 'Send failed';
          results.push({
            tokenPreview: maskFcmToken(targetRec.token),
            uid: targetRec.uid,
            success: false,
            errorCode: code,
            errorMessage: message,
          });
          if (INVALID_TOKEN_CODES.has(code)) {
            await unregisterUserToken(targetRec.uid, targetRec.token);
            removedInvalidTokens += 1;
          }
        }
      }
    }

    return {
      targetCount: targets.length,
      sentCount,
      failureCount,
      removedInvalidTokens,
      usedLiveAdminSdk: !options.messagingOverride,
      warnings,
      results,
    };
  }

  return {
    registerUserToken,
    unregisterUserToken,
    collectTokensForUid,
    collectAllTokens,
    listTokenSummaries,
    sendPushNotification,
  };
}
