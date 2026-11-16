import fs from 'node:fs';
import path from 'node:path';
import { getFirebaseRuntimeConfig } from './firebaseAuth.ts';
import type {
  AdSettings,
  CategoryConfig,
  ContentCategory,
  EditorGrant,
  OrderRecord,
  StoryItem,
  StoryTicketEntitlement,
  UserProfile,
} from '../src/types/content.ts';
import { normalizeAdSettings } from '../src/utils/adConfig.ts';

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

let cachedMetadataToken: { token: string; expiresAt: number } | null = null;
let metadataUnavailableUntil = 0;

export async function getCloudMetadataAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedMetadataToken && cachedMetadataToken.expiresAt > now + 30_000) {
    return cachedMetadataToken.token;
  }
  if (now < metadataUnavailableUntil) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      metadataUnavailableUntil = now + 5 * 60_000;
      return null;
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      metadataUnavailableUntil = now + 5 * 60_000;
      return null;
    }
    cachedMetadataToken = {
      token: data.access_token,
      expiresAt: now + Math.max(60, Number(data.expires_in) || 300) * 1000,
    };
    return cachedMetadataToken.token;
  } catch {
    metadataUnavailableUntil = now + 5 * 60_000;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAuthToken(preferredBearer?: string): Promise<string | null> {
  if (preferredBearer && preferredBearer.split('.').length === 3) {
    return preferredBearer;
  }
  return getCloudMetadataAccessToken();
}

function getDocBaseUrl(): string | null {
  const { projectId, databaseId } = getFirebaseRuntimeConfig();
  if (!projectId) return null;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/databases/${encodeURIComponent(databaseId || '(default)')}/documents`;
}

function encodeValue(val: unknown, timestampKeys = new Set(['updatedAt', 'createdAt', 'verifiedAt', 'lastCompletedAt'])): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => encodeValue(item, timestampKeys)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (timestampKeys.has(k) && typeof v === 'string' && !Number.isNaN(Date.parse(v))) {
        fields[k] = { timestampValue: new Date(v).toISOString() };
      } else {
        fields[k] = encodeValue(v, timestampKeys);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreDocument(obj: Record<string, unknown>): {
  fields: Record<string, FirestoreValue>;
} {
  const encoded = encodeValue(obj) as { mapValue?: { fields?: Record<string, FirestoreValue> } };
  return { fields: encoded.mapValue?.fields || {} };
}

function decodeValue(val: FirestoreValue): unknown {
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(decodeValue);
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      out[k] = decodeValue(v);
    }
    return out;
  }
  return null;
}

async function patchDoc(
  docPath: string,
  payload: Record<string, unknown>,
  preferredBearer?: string,
): Promise<boolean> {
  const baseUrl = getDocBaseUrl();
  const token = await resolveAuthToken(preferredBearer);
  if (!baseUrl || !token) return false;

  try {
    const res = await fetch(`${baseUrl}/${docPath}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(toFirestoreDocument(payload)),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteDoc(docPath: string, preferredBearer?: string): Promise<boolean> {
  const baseUrl = getDocBaseUrl();
  const token = await resolveAuthToken(preferredBearer);
  if (!baseUrl || !token) return false;

  try {
    const res = await fetch(`${baseUrl}/${docPath}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function listCollectionDocs(
  collectionName: string,
  preferredBearer?: string,
): Promise<Array<Record<string, unknown>>> {
  const baseUrl = getDocBaseUrl();
  const token = await resolveAuthToken(preferredBearer);
  if (!baseUrl || !token) return [];

  try {
    const res = await fetch(`${baseUrl}/${collectionName}?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      documents?: Array<{ fields?: Record<string, FirestoreValue> }>;
    };
    return (data.documents || []).map((doc) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(doc.fields || {})) {
        out[k] = decodeValue(v);
      }
      return out;
    });
  } catch {
    return [];
  }
}

export async function syncStoryToFirestoreRest(
  story: StoryItem,
  bearerToken?: string,
): Promise<void> {
  const docId = story.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  await patchDoc(
    `stories/${encodeURIComponent(docId)}`,
    {
      ...story,
      id: docId,
      updatedAt: story.updatedAt || new Date().toISOString(),
    },
    bearerToken,
  );
}

export async function deleteStoryFromFirestoreRest(
  storyId: string,
  bearerToken?: string,
): Promise<void> {
  const docId = storyId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  await deleteDoc(`stories/${encodeURIComponent(docId)}`, bearerToken);
}

export async function syncCategoryToFirestoreRest(
  categoryId: ContentCategory,
  enabledByAdmin: boolean,
  actorUid: string,
  bearerToken?: string,
): Promise<void> {
  await patchDoc(
    `categories/${encodeURIComponent(categoryId)}`,
    {
      id: categoryId,
      enabledByAdmin,
      updatedBy: actorUid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'system',
      updatedAt: new Date().toISOString(),
    },
    bearerToken,
  );
}

export async function syncEditorToFirestoreRest(
  grant: EditorGrant,
  bearerToken?: string,
): Promise<void> {
  if (!grant.uid || !/^[a-zA-Z0-9_-]+$/.test(grant.uid)) return;
  await patchDoc(
    `editors/${encodeURIComponent(grant.uid)}`,
    {
      uid: grant.uid,
      email: grant.email,
      name: grant.name,
      role: 'editor',
      permissions: grant.permissions,
      grantedBy: grant.grantedBy,
      updatedAt: grant.updatedAt || new Date().toISOString(),
    },
    bearerToken,
  );
}

export async function deleteEditorFromFirestoreRest(
  uid: string,
  bearerToken?: string,
): Promise<void> {
  if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) return;
  await deleteDoc(`editors/${encodeURIComponent(uid)}`, bearerToken);
}

export async function syncOrderToFirestoreRest(order: OrderRecord): Promise<void> {
  const safeOrderId = order.orderId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  await patchDoc(`orders/${encodeURIComponent(safeOrderId)}`, {
    ...order,
    orderId: safeOrderId,
  });
}

export async function syncEntitlementToFirestoreRest(
  user: UserProfile,
  ent: StoryTicketEntitlement,
): Promise<void> {
  const uid = user.firebaseUid || user.id;
  if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) return;
  const safeStoryId = ent.storyId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  await patchDoc(
    `users/${encodeURIComponent(uid)}/entitlements/${encodeURIComponent(safeStoryId)}`,
    {
      storyId: safeStoryId,
      userId: uid,
      remainingListens: ent.remainingListens,
      totalListensUsed: ent.totalListensUsed,
      completedEpisodeIdsInCycle: ent.completedEpisodeIdsInCycle || [],
      lastOrderId: ent.lastOrderId,
      updatedAt: ent.updatedAt || new Date().toISOString(),
    },
  );
}

export async function hydrateCatalogFromFirestoreIfAvailable(): Promise<{
  stories?: StoryItem[];
  categories?: Array<{ id: ContentCategory; enabledByAdmin: boolean }>;
  editors?: EditorGrant[];
} | null> {
  const token = await getCloudMetadataAccessToken();
  if (!token) return null;

  const [storiesRaw, categoriesRaw, editorsRaw] = await Promise.all([
    listCollectionDocs('stories', token),
    listCollectionDocs('categories', token),
    listCollectionDocs('editors', token),
  ]);

  if (storiesRaw.length === 0 && categoriesRaw.length === 0 && editorsRaw.length === 0) {
    return null;
  }

  return {
    stories: storiesRaw.length > 0 ? (storiesRaw as unknown as StoryItem[]) : undefined,
    categories:
      categoriesRaw.length > 0
        ? (categoriesRaw as unknown as Array<{ id: ContentCategory; enabledByAdmin: boolean }>)
        : undefined,
    editors: editorsRaw.length > 0 ? (editorsRaw as unknown as EditorGrant[]) : undefined,
  };
}

export async function syncAdSettingsToFirestoreRest(
  settings: AdSettings,
  settingId: 'draft' | 'published',
  actorUid: string,
  bearerToken?: string,
): Promise<boolean> {
  const { projectId, databaseId } = getFirebaseRuntimeConfig();
  const baseUrl = getDocBaseUrl();
  const token = await resolveAuthToken(bearerToken);
  if (!projectId || !baseUrl || !token || !actorUid) return false;

  const norm = normalizeAdSettings(settings, settingId);
  const safeUid = actorUid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const fullDocName = `projects/${projectId}/databases/${databaseId || '(default)'}/documents/ad_settings/${settingId}`;

  const docFields: Record<string, unknown> = {
    enabled: norm.enabled,
    version: Math.max(1, norm.version || 1),
    status: settingId,
    socialBarScript: norm.socialBarScript,
    socialBarMobileScript: norm.socialBarMobileScript,
    popunderScript: norm.popunderScript,
    popunderMobileScript: norm.popunderMobileScript,
    smartlinkUrl: norm.smartlinkUrl,
    banner320x50Code: norm.banner320x50Code,
    banner320x50DesktopCode: norm.banner320x50DesktopCode,
    banner160x300Code: norm.banner160x300Code,
    nativeAdCode: norm.nativeAdCode,
    nativeAdMobileCode: norm.nativeAdMobileCode,
    enabledTypes: norm.enabledTypes,
    pages: norm.pages,
    slots: norm.slots,
    devices: norm.devices,
    ...(norm.publishedAt ? { publishedAt: norm.publishedAt } : {}),
    updatedBy: safeUid,
  };

  try {
    const res = await fetch(`${baseUrl}:commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: fullDocName,
              fields: toFirestoreDocument(docFields).fields,
            },
            updateTransforms: [
              {
                fieldPath: 'updatedAt',
                setToServerValue: 'REQUEST_TIME',
              },
            ],
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPublishedAdSettingsFromFirestoreRest(): Promise<AdSettings | null> {
  const baseUrl = getDocBaseUrl();
  if (!baseUrl) return null;

  let apiKey = (process.env.FIREBASE_API_KEY || '').trim();
  if (!apiKey) {
    try {
      const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as { apiKey?: string };
        apiKey = (cfg.apiKey || '').trim();
      }
    } catch {
      // Optional key
    }
  }

  try {
    const url = apiKey
      ? `${baseUrl}/ad_settings/published?key=${encodeURIComponent(apiKey)}`
      : `${baseUrl}/ad_settings/published`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const doc = (await res.json()) as { fields?: Record<string, FirestoreValue> };
    if (!doc?.fields) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      out[k] = decodeValue(v);
    }
    return normalizeAdSettings(out, 'published');
  } catch {
    return null;
  }
}
