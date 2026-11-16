import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import {
  DEFAULT_TICKET_PRICE_INR,
  INITIAL_CATEGORIES,
  INITIAL_STORIES,
  MAX_LISTENS_PER_PURCHASE,
  NPASS_MONTHLY_PRICE_INR,
  synthesizeAtmosphericWav,
} from './server/catalogSeed.ts';
import {
  ALL_ADMIN_PERMISSIONS,
  EDITOR_ALLOWED_PERMISSIONS,
  checkFirestoreRoleDoc,
  getFirebaseRuntimeConfig,
  isEnvProvisionedOwner,
  parseFirestorePermissions,
  sanitizeEditorPermissions,
  verifyFirebaseIdToken,
  type VerifiedFirebaseToken,
} from './server/firebaseAuth.ts';
import {
  createFcmNotificationService,
  type MessagingAdapter,
  type StoredFcmTokenRecord,
} from './server/fcmNotifications.ts';
import {
  deleteEditorFromFirestoreRest,
  deleteStoryFromFirestoreRest,
  fetchPublishedAdSettingsFromFirestoreRest,
  hydrateCatalogFromFirestoreIfAvailable,
  syncAdSettingsToFirestoreRest,
  syncCategoryToFirestoreRest,
  syncEditorToFirestoreRest,
  syncEntitlementToFirestoreRest,
  syncOrderToFirestoreRest,
  syncStoryToFirestoreRest,
} from './server/firestoreSync.ts';
import {
  createSignedMediaToken,
  createUniqueUploadFilename,
  extractUploadedFilenameFromUrl,
  fetchFromGcsFallback,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  type MediaFolder,
  type MediaKind,
  type MediaManifestEntry,
  type MediaTier,
  mirrorUploadToGcsIfAvailable,
  resolveExtensionSpec,
  resolveOrCreateSigningSecret,
  resolveSafeUploadPath,
  SAFE_UPLOAD_FILENAME_REGEX,
  stripMediaTokenQuery,
  verifyGatewayPaymentSignature,
  verifyMediaMagicBytes,
  verifySignedMediaToken,
  verifyWebhookHmacSignature,
} from './server/mediaStorage.ts';
import type {
  AccessPolicy,
  AdminPermission,
  AdSettings,
  BootstrapPayload,
  CategoryConfig,
  ContentCategory,
  EditorGrant,
  Language,
  OrderRecord,
  PlaybackProgress,
  StoryItem,
  StoryTicketEntitlement,
  UserProfile,
} from './src/types/content.ts';
import { createDefaultAdSettings, normalizeAdSettings } from './src/utils/adConfig.ts';
import {
  SECTION_AND_INFO_SEO_SPECS,
  getEpisodePath,
  getStoryPath,
} from './src/utils/routes.ts';

dotenv.config();

interface PersistedState {
  stories: StoryItem[];
  categoryToggles: Record<ContentCategory, boolean>;
  users: Record<string, UserProfile>;
  editors?: Record<string, EditorGrant>; // keyed by lowercase email
  sessions: Record<string, string>; // opaque listener tokens only: token -> userId
  orders: OrderRecord[];
  usedGatewayPaymentIds?: string[]; // replay prevention for gateway payments
  progressByUser: Record<string, PlaybackProgress[]>;
  nPassMonthlyPriceInr?: number;
  pricingMigratedTo9?: boolean;
  adSettings?: AdSettings;
  adDraftSettings?: AdSettings;
  fcmTokensByUser?: Record<string, StoredFcmTokenRecord[]>;
}

export interface GoppoAppOptions {
  dataDir?: string;
  verifyTokenImpl?: (token: string) => Promise<VerifiedFirebaseToken | null>;
  isProductionOverride?: boolean;
  allowSandboxOverride?: boolean;
  paymentGatewayOverride?: {
    enabled: boolean;
    keyId?: string;
    keySecret?: string;
    webhookSecret?: string;
  };
  skipCloudHydration?: boolean;
  messagingOverride?: MessagingAdapter;
  disableLiveFirebaseAdmin?: boolean;
}

export function createGoppoApp(options: GoppoAppOptions = {}) {
  const IS_CLOUD_RUN = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);
  const IS_TEST_HARNESS =
    process.env.GOPPO_NO_AUTOSTART === 'true' || process.env.NODE_ENV === 'test';
  const HAS_TEST_OVERRIDES = Boolean(
    options.verifyTokenImpl ||
      options.messagingOverride ||
      options.disableLiveFirebaseAdmin,
  );
  if (IS_CLOUD_RUN && process.env.NODE_ENV === 'production' && !IS_TEST_HARNESS && HAS_TEST_OVERRIDES) {
    throw new Error(
      'SECURITY_VIOLATION: Mock authentication or Firebase Admin overrides are strictly forbidden in Cloud Run production.',
    );
  }
  const IS_PRODUCTION =
    typeof options.isProductionOverride === 'boolean'
      ? options.isProductionOverride
      : process.env.NODE_ENV === 'production' || IS_CLOUD_RUN;

  const SANDBOX_PAYMENT_ALLOWED =
    !IS_PRODUCTION &&
    (typeof options.allowSandboxOverride === 'boolean'
      ? options.allowSandboxOverride
      : process.env.ALLOW_SANDBOX_PAYMENT === 'true');

  const gatewayCfg = options.paymentGatewayOverride || {
    enabled: process.env.PAYMENT_GATEWAY_ENABLED === 'true',
    keyId: process.env.PAYMENT_GATEWAY_KEY_ID,
    keySecret: process.env.PAYMENT_GATEWAY_KEY_SECRET,
    webhookSecret: process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET,
  };
  const LIVE_GATEWAY_CONNECTED =
    Boolean(gatewayCfg.enabled) && Boolean(gatewayCfg.keyId) && Boolean(gatewayCfg.keySecret);

  const verifyIdTokenFn = options.verifyTokenImpl || verifyFirebaseIdToken;

  const DATA_DIR = path.resolve(
    process.cwd(),
    options.dataDir || process.env.GOPPO_DATA_DIR || '.goppo-data',
  );
  const STATE_FILE = path.join(DATA_DIR, 'platform-state-v2.json');
  const MEDIA_MANIFEST_FILE = path.join(DATA_DIR, 'media-manifest.json');
  const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
  const CHUNK_STAGING_DIR = path.join(DATA_DIR, 'upload-staging');

  for (const dir of [DATA_DIR, UPLOADS_DIR, CHUNK_STAGING_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const MEDIA_SIGNING_SECRET = resolveOrCreateSigningSecret(DATA_DIR);

function createDefaultState(): PersistedState {
  const categoryToggles: Record<ContentCategory, boolean> = {
    audio: true,
    animation: true,
    films: true,
  };
  for (const c of INITIAL_CATEGORIES) {
    categoryToggles[c.id] = c.enabledByAdmin;
  }

  return {
    stories: structuredClone(INITIAL_STORIES),
    categoryToggles,
    users: {},
    editors: {},
    sessions: {},
    orders: [],
    progressByUser: {},
    adSettings: createDefaultAdSettings('published'),
    adDraftSettings: createDefaultAdSettings('draft'),
    fcmTokensByUser: {},
  };
}

function sortStoriesNewestFirst(list: StoryItem[]): StoryItem[] {
  return [...list].sort((a, b) => {
    const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return timeB - timeA;
  });
}

function ensureUserEntitlements(user: UserProfile): boolean {
  let changed = false;
  if (!user.storyEntitlements) {
    user.storyEntitlements = {};
    changed = true;
  }
  const nowIso = new Date().toISOString();

  for (const sid of user.purchasedStoryIds || []) {
    if (!user.storyEntitlements[sid]) {
      user.storyEntitlements[sid] = {
        storyId: sid,
        remainingListens: MAX_LISTENS_PER_PURCHASE,
        totalListensUsed: 0,
        completedEpisodeIdsInCycle: [],
        updatedAt: nowIso,
      };
      changed = true;
    }
  }

  const activePurchasedIds = Object.values(user.storyEntitlements)
    .filter((ent) => ent.remainingListens > 0)
    .map((ent) => ent.storyId);

  const prevIds = user.purchasedStoryIds || [];
  if (
    prevIds.length !== activePurchasedIds.length ||
    activePurchasedIds.some((id) => !prevIds.includes(id))
  ) {
    user.purchasedStoryIds = activePurchasedIds;
    changed = true;
  }

  return changed;
}

function loadState(): PersistedState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed && Array.isArray(parsed.stories) && parsed.stories.length > 0) {
        if (!parsed.pricingMigratedTo9) {
          parsed.stories = parsed.stories.map((s) =>
            s.ticketPriceInr > 0
              ? { ...s, ticketPriceInr: DEFAULT_TICKET_PRICE_INR }
              : s,
          );
          parsed.pricingMigratedTo9 = true;
        }
        parsed.stories = sortStoriesNewestFirst(parsed.stories);
        parsed.editors = parsed.editors || {};
        parsed.usedGatewayPaymentIds = Array.isArray(parsed.usedGatewayPaymentIds)
          ? parsed.usedGatewayPaymentIds
          : [];
        for (const u of Object.values(parsed.users || {})) {
          ensureUserEntitlements(u);
        }
        // Security Hardening: invalidate any legacy opaque sessions belonging to elevated accounts
        const cleanedSessions: Record<string, string> = {};
        for (const [tok, uid] of Object.entries(parsed.sessions || {})) {
          const targetUser = parsed.users?.[uid];
          if (targetUser && targetUser.role === 'listener' && !tok.startsWith('adm_')) {
            cleanedSessions[tok] = uid;
          }
        }
        parsed.sessions = cleanedSessions;
        parsed.adSettings = normalizeAdSettings(parsed.adSettings, 'published');
        parsed.adDraftSettings = normalizeAdSettings(
          parsed.adDraftSettings || parsed.adSettings,
          'draft',
        );
        parsed.fcmTokensByUser =
          parsed.fcmTokensByUser && typeof parsed.fcmTokensByUser === 'object'
            ? parsed.fcmTokensByUser
            : {};
        return parsed;
      }
    }
  } catch {
    // Fall back safely to clean seed state if local cache is unreadable
  }
  const fresh = createDefaultState();
  fresh.pricingMigratedTo9 = true;
  fresh.usedGatewayPaymentIds = [];
  fresh.fcmTokensByUser = {};
  return fresh;
}

const state: PersistedState = loadState();
const audioBufferCache = new Map<string, Buffer>();

function loadMediaManifest(): Record<string, MediaManifestEntry> {
  try {
    if (fs.existsSync(MEDIA_MANIFEST_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(MEDIA_MANIFEST_FILE, 'utf-8')) as Record<
        string,
        MediaManifestEntry
      >;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // Fallback to empty manifest
  }
  return {};
}

const mediaManifest: Record<string, MediaManifestEntry> = loadMediaManifest();

function saveMediaManifest(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(MEDIA_MANIFEST_FILE, JSON.stringify(mediaManifest, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only environments
  }
}

interface ChunkUploadSession {
  uploadId: string;
  userId: string;
  originalName: string;
  mediaType: MediaKind;
  folder: MediaFolder;
  mimeType: string;
  resolvedExt: string;
  accessTier: MediaTier;
  expectedSize: number;
  maxBytes: number;
  tempPath: string;
  bytesWritten: number;
  createdAt: number;
}
const UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD_SESSIONS_PER_USER = 5;
const MAX_TOTAL_UPLOAD_SESSIONS = 40;
const uploadSessions = new Map<string, ChunkUploadSession>();

function pruneExpiredUploadSessions(): void {
  const now = Date.now();
  for (const [id, sess] of uploadSessions.entries()) {
    if (now - sess.createdAt > UPLOAD_SESSION_TTL_MS) {
      uploadSessions.delete(id);
      try {
        fs.rmSync(sess.tempPath, { force: true });
      } catch {
        // Ignore cleanup failure on missing temp file
      }
    }
  }
}

function saveStateBackup(reason: string): void {
  try {
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'snapshot';
    const backupFile = path.join(backupDir, `catalog-${safeReason}-${Date.now()}.json`);
    fs.writeFileSync(
      backupFile,
      JSON.stringify(
        {
          backedUpAt: new Date().toISOString(),
          reason: safeReason,
          stories: state.stories,
          categoryToggles: state.categoryToggles,
          nPassMonthlyPriceInr: state.nPassMonthlyPriceInr,
        },
        null,
        2,
      ),
      'utf-8',
    );
    const existing = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('catalog-') && f.endsWith('.json'))
      .sort();
    while (existing.length > 5) {
      const oldest = existing.shift();
      if (oldest) {
        fs.rmSync(path.join(backupDir, oldest), { force: true });
      }
    }
  } catch {
    // Non-fatal in read-only environments
  }
}

function saveState(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only environments; in-memory state remains active
  }
}

function extractBearerToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function findExistingUserForFirebase(verified: VerifiedFirebaseToken): UserProfile | undefined {
  const byUid = Object.values(state.users).find((u) => u.firebaseUid === verified.uid);
  if (byUid) return byUid;
  if (verified.email && verified.emailVerified) {
    return Object.values(state.users).find(
      (u) => u.email.toLowerCase() === verified.email.toLowerCase(),
    );
  }
  return undefined;
}

async function resolveFirebaseUserProfile(
  token: string,
  verified: VerifiedFirebaseToken,
  preferredLangOverride?: Language,
): Promise<UserProfile> {
  const existing = findExistingUserForFirebase(verified);

  // Determine highest authoritative server-side role
  let resolvedRole: UserProfile['role'] = 'listener';
  let resolvedPermissions: AdminPermission[] | undefined = undefined;

  const isOwnerByEnv = isEnvProvisionedOwner(verified);
  const firestoreAdminDoc =
    verified.emailVerified && !options.disableLiveFirebaseAdmin
      ? await checkFirestoreRoleDoc(token, 'admins', verified.uid)
      : null;
  const isOwnerByExistingRecord =
    verified.emailVerified && existing?.role === 'admin';

  if (isOwnerByEnv || firestoreAdminDoc !== null || isOwnerByExistingRecord) {
    resolvedRole = 'admin';
    resolvedPermissions = [...ALL_ADMIN_PERMISSIONS];
  } else if (verified.emailVerified) {
    // Check Editor grants (Firestore /editors/{uid} or server-stored state.editors)
    const firestoreEditorDoc = !options.disableLiveFirebaseAdmin
      ? await checkFirestoreRoleDoc(token, 'editors', verified.uid)
      : null;
    const localEditorGrant =
      (verified.email && state.editors?.[verified.email.toLowerCase()]) ||
      Object.values(state.editors || {}).find((ed) => ed.uid === verified.uid);

    if (firestoreEditorDoc !== null) {
      const perms = parseFirestorePermissions(firestoreEditorDoc);
      if (perms.length > 0) {
        resolvedRole = 'editor';
        resolvedPermissions = perms;
      }
    } else if (localEditorGrant) {
      const perms = sanitizeEditorPermissions(localEditorGrant.permissions);
      if (perms.length > 0) {
        resolvedRole = 'editor';
        resolvedPermissions = perms;
        if (!localEditorGrant.uid) {
          localEditorGrant.uid = verified.uid;
          saveState();
        }
      }
    }
  }

  if (existing) {
    existing.firebaseUid = verified.uid;
    existing.role = resolvedRole;
    existing.permissions = resolvedPermissions;
    if (verified.name && (!existing.name || existing.name === existing.email.split('@')[0])) {
      existing.name = verified.name;
    }
    if (preferredLangOverride) {
      existing.preferredLanguage = preferredLangOverride;
    }
    ensureUserEntitlements(existing);
    saveState();
    return existing;
  }

  const newId = `usr_${crypto.randomBytes(6).toString('hex')}`;
  const created: UserProfile = {
    id: newId,
    firebaseUid: verified.uid,
    name: verified.name || (verified.email ? verified.email.split('@')[0] : 'Goppo Kahini User'),
    email: verified.email,
    role: resolvedRole,
    permissions: resolvedPermissions,
    preferredLanguage: preferredLangOverride || 'bn',
    purchasedStoryIds: [],
    storyEntitlements: {},
    membership: {
      planId: 'npass_monthly_9',
      priceInr: NPASS_MONTHLY_PRICE_INR,
      status: 'INACTIVE',
    },
  };
  state.users[newId] = created;
  saveState();
  return created;
}

async function resolveAuthenticatedUser(req: Request): Promise<UserProfile | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  // Cryptographically verify Firebase Auth ID tokens (JWT format)
  if (token.split('.').length === 3) {
    const verified = await verifyIdTokenFn(token);
    if (!verified) return null;
    return resolveFirebaseUserProfile(token, verified);
  }

  // Opaque local session tokens are strictly restricted to regular listeners ONLY.
  // Admin and Editor roles ALWAYS require cryptographically verified Firebase ID tokens.
  const userId = state.sessions[token];
  if (!userId) return null;
  const user = state.users[userId];
  if (!user || user.role !== 'listener') {
    return null;
  }
  return user;
}

function hasStaffPermission(user: UserProfile | null, permission: AdminPermission): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'editor') {
    return (
      EDITOR_ALLOWED_PERMISSIONS.includes(permission) &&
      Array.isArray(user.permissions) &&
      user.permissions.includes(permission)
    );
  }
  return false;
}

function hasAnyStaffAccess(user: UserProfile | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'editor') {
    return Array.isArray(user.permissions) && user.permissions.length > 0;
  }
  return false;
}

function computeCategories(): CategoryConfig[] {
  const categories: ContentCategory[] = ['audio', 'animation', 'films'];
  return categories.map((id) => {
    const published = state.stories.filter(
      (s) => s.category === id && s.publicationStatus === 'published',
    );
    return {
      id,
      enabledByAdmin: Boolean(state.categoryToggles[id]),
      publishedCountBn: published.filter((s) => s.language === 'bn').length,
      publishedCountHi: published.filter((s) => s.language === 'hi').length,
    };
  });
}

function userHasStoryAccess(user: UserProfile | null, story: StoryItem): boolean {
  if (!user) return false;
  if (story.ticketPriceInr <= 0) return true;
  if (ensureUserEntitlements(user)) {
    saveState();
  }
  const ent = user.storyEntitlements?.[story.id];
  const hasTicket =
    (story.accessPolicy === 'ticket_only' || story.accessPolicy === 'both') &&
    Boolean(ent && ent.remainingListens > 0);
  const hasNPass =
    user.membership.status === 'ACTIVE' &&
    (story.accessPolicy === 'npass_included' || story.accessPolicy === 'both');
  return hasTicket || hasNPass;
}

function sanitizeStoriesForViewer(stories: StoryItem[], user: UserProfile | null): StoryItem[] {
  const isStaff = hasStaffPermission(user, 'manage_stories') || user?.role === 'admin';
  const viewerUid = user?.id || 'viewer';

  return stories.map((story) => {
    const isFree = story.ticketPriceInr <= 0;
    const isPublished = story.publicationStatus === 'published';
    const entitled = isStaff || isFree || userHasStoryAccess(user, story);

    const signIfProtectedUpload = (
      rawUrl: string | undefined,
      epId: string,
      forceSign = false,
    ): string | undefined => {
      if (!rawUrl) return undefined;
      const clean = stripMediaTokenQuery(rawUrl);
      if (!clean) return undefined;
      const fn = extractUploadedFilenameFromUrl(clean);
      if (fn && (forceSign || !isFree || !isPublished)) {
        const mt = createSignedMediaToken(
          MEDIA_SIGNING_SECRET,
          { fn, sid: story.id, eid: epId, uid: viewerUid },
          7200,
        );
        return `/api/uploads/${fn}?mt=${encodeURIComponent(mt)}`;
      }
      return clean;
    };

    const sanitizedEpisodes = (story.episodes || []).map((ep) => {
      if (!entitled) {
        // Security: redact premium episode URLs for unauthenticated/unpaid visitors
        const { audioUrl: _a, videoUrl: _v, ...safeEp } = ep;
        return safeEp;
      }
      return {
        ...ep,
        audioUrl: signIfProtectedUpload(ep.audioUrl, ep.id),
        videoUrl: signIfProtectedUpload(ep.videoUrl, ep.id),
      };
    });

    if (!isPublished && isStaff) {
      return {
        ...story,
        coverArt: signIfProtectedUpload(story.coverArt, 'cover', true) || story.coverArt,
        heroArt: signIfProtectedUpload(story.heroArt, 'hero', true) || story.heroArt,
        trailerAudioUrl: signIfProtectedUpload(story.trailerAudioUrl, 'trailer', true),
        trailerVideoUrl: signIfProtectedUpload(story.trailerVideoUrl, 'trailer', true),
        episodes: sanitizedEpisodes,
      };
    }

    return {
      ...story,
      episodes: sanitizedEpisodes,
    };
  });
}

function isUploadFilePubliclyAccessible(fileName: string): {
  isPublicFree: boolean;
  isDraftOnly: boolean;
  owningStories: StoryItem[];
  inferredTier: MediaTier;
} {
  const targetUrl = `/api/uploads/${fileName}`;
  const manifest = mediaManifest[fileName];
  if (fileName.startsWith('prem_') || manifest?.accessTier === 'premium') {
    const owning = state.stories.filter((s) =>
      s.episodes.some(
        (ep) =>
          stripMediaTokenQuery(ep.audioUrl) === targetUrl ||
          stripMediaTokenQuery(ep.videoUrl) === targetUrl,
      ),
    );
    return { isPublicFree: false, isDraftOnly: false, owningStories: owning, inferredTier: 'premium' };
  }

  let referencedInFreeOrTrailer = false;
  const premiumOwning: StoryItem[] = [];
  let referencedInDraftOnly = false;

  for (const s of state.stories) {
    const isTrailerOrArt =
      stripMediaTokenQuery(s.trailerAudioUrl) === targetUrl ||
      stripMediaTokenQuery(s.trailerVideoUrl) === targetUrl ||
      stripMediaTokenQuery(s.coverArt) === targetUrl ||
      stripMediaTokenQuery(s.heroArt) === targetUrl;

    const inEpisode = s.episodes.some(
      (ep) =>
        stripMediaTokenQuery(ep.audioUrl) === targetUrl ||
        stripMediaTokenQuery(ep.videoUrl) === targetUrl,
    );

    if (isTrailerOrArt) {
      if (s.publicationStatus === 'published') {
        referencedInFreeOrTrailer = true;
      } else {
        referencedInDraftOnly = true;
      }
    }
    if (inEpisode) {
      if (s.publicationStatus !== 'published') {
        referencedInDraftOnly = true;
      } else if (s.ticketPriceInr <= 0) {
        referencedInFreeOrTrailer = true;
      } else {
        premiumOwning.push(s);
      }
    }
  }

  if (referencedInFreeOrTrailer) {
    return { isPublicFree: true, isDraftOnly: false, owningStories: [], inferredTier: 'free' };
  }
  if (premiumOwning.length > 0) {
    return { isPublicFree: false, isDraftOnly: false, owningStories: premiumOwning, inferredTier: 'premium' };
  }
  // Fail-closed: draft-only, orphaned, or unattached uploads are NEVER publicly readable without auth or signed ?mt= token
  return {
    isPublicFree: false,
    isDraftOnly: referencedInDraftOnly ? true : true,
    owningStories: [],
    inferredTier: 'free',
  };
}

  saveState();
  if (!options.skipCloudHydration) {
    void hydrateCatalogFromFirestoreIfAvailable().then((cloudData) => {
      if (!cloudData) return;
      let updated = false;
      if (cloudData.stories && cloudData.stories.length > 0) {
        const merged = new Map<string, StoryItem>();
        for (const s of state.stories) merged.set(s.id, s);
        for (const s of cloudData.stories) {
          if (s.id && s.title) merged.set(s.id, s);
        }
        state.stories = sortStoriesNewestFirst(Array.from(merged.values()));
        updated = true;
      }
      if (cloudData.categories) {
        for (const cat of cloudData.categories) {
          if (cat.id && typeof cat.enabledByAdmin === 'boolean') {
            state.categoryToggles[cat.id] = cat.enabledByAdmin;
            updated = true;
          }
        }
      }
      if (cloudData.editors) {
        state.editors = state.editors || {};
        for (const ed of cloudData.editors) {
          if (ed.email) {
            state.editors[ed.email.toLowerCase()] = ed;
            updated = true;
          }
        }
      }
      if (updated) saveState();
    });
    void fetchPublishedAdSettingsFromFirestoreRest().then((cloudAds) => {
      if (!cloudAds) return;
      const fsTime = cloudAds.publishedAt ? Date.parse(cloudAds.publishedAt) : 0;
      const localTime = state.adSettings?.publishedAt ? Date.parse(state.adSettings.publishedAt) : 0;
      const localVer = state.adSettings?.version || 1;
      if (
        (cloudAds.enabled && !state.adSettings?.enabled) ||
        fsTime > localTime ||
        cloudAds.version > localVer
      ) {
        state.adSettings = cloudAds;
        state.adDraftSettings = normalizeAdSettings({ ...cloudAds, status: 'draft' }, 'draft');
        saveState();
      }
    });
  }

  const fcmService = createFcmNotificationService({
    localTokensByUser: state.fcmTokensByUser || (state.fcmTokensByUser = {}),
    saveLocalState: saveState,
    findUidByEmail: async (emailLower: string) => {
      const matchedUser = Object.values(state.users).find(
        (u) => (u.email || '').trim().toLowerCase() === emailLower,
      );
      return matchedUser?.firebaseUid || matchedUser?.id || null;
    },
    messagingOverride: options.messagingOverride,
    disableLiveFirebaseAdmin: options.disableLiveFirebaseAdmin,
  });

  const app = express();
  app.use((_req: Request, res: Response, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
  const standardJsonParser = express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  });
  const largeAdminJsonParser = express.json({ limit: '50mb' });
  app.use((req: Request, res: Response, next) => {
    if (req.path === '/api/admin/upload-media' || req.path === '/api/admin/import') {
      largeAdminJsonParser(req, res, next);
      return;
    }
    standardJsonParser(req, res, next);
  });
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ---------------------------------------------------------------------------
  // PUBLIC & AUTHENTICATED BOOTSTRAP (Always returns stories sorted newest first)
  // ---------------------------------------------------------------------------
  app.get('/api/bootstrap', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (user && ensureUserEntitlements(user)) {
      saveState();
    }
    const canSeeDrafts = hasStaffPermission(user, 'manage_stories');
    const sorted = sortStoriesNewestFirst(state.stories);
    const visibleStories = canSeeDrafts
      ? sorted
      : sorted.filter((s) => s.publicationStatus === 'published');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const payload: BootstrapPayload = {
      stories: sanitizeStoriesForViewer(visibleStories, user),
      categories: computeCategories(),
      nPassMonthlyPriceInr: state.nPassMonthlyPriceInr || NPASS_MONTHLY_PRICE_INR,
      liveGatewayConnected: LIVE_GATEWAY_CONNECTED,
      sandboxModeEnabled: SANDBOX_PAYMENT_ALLOWED,
      user,
      orders: user ? state.orders.filter((o) => o.userId === user.id) : [],
      progress: user ? state.progressByUser[user.id] || [] : [],
      adSettings: normalizeAdSettings(state.adSettings, 'published'),
    };
    res.json(payload);
  });

  // Dedicated public no-cache endpoint for Published Ad Configuration (used by web + PWA)
  app.get('/api/ads/published', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({
      adSettings: normalizeAdSettings(state.adSettings, 'published'),
    });
  });

  // ---------------------------------------------------------------------------
  // ADVERTISEMENT SETTINGS MANAGEMENT (Draft + Publish workflow, Protected)
  // ---------------------------------------------------------------------------
  app.post('/api/admin/ads/draft', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to save ad draft settings.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const actorUid = user.firebaseUid || user.id || 'admin';
    const nextDraft = normalizeAdSettings(
      {
        ...(req.body || {}),
        status: 'draft',
        updatedAt: nowIso,
        updatedBy: actorUid,
      },
      'draft',
    );
    state.adDraftSettings = nextDraft;
    saveState();
    const bearer = extractBearerToken(req);
    const firestoreSynced = await syncAdSettingsToFirestoreRest(nextDraft, 'draft', actorUid, bearer);
    res.json({ ok: true, draftSettings: state.adDraftSettings, firestoreSynced });
  });

  const handlePublishAdsRoute = async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to publish ad settings.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const actorUid = user.firebaseUid || user.id || 'admin';
    const currentVersion = Math.max(0, state.adSettings?.version || 0, Number(req.body?.version) || 0);
    const nextVersion = currentVersion + 1;
    const nextPublished = normalizeAdSettings(
      {
        ...(req.body || {}),
        status: 'published',
        version: nextVersion,
        publishedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actorUid,
      },
      'published',
    );
    state.adSettings = nextPublished;
    state.adDraftSettings = normalizeAdSettings(
      { ...nextPublished, status: 'draft' },
      'draft',
    );
    saveState();
    const bearer = extractBearerToken(req);
    const [pubSynced] = await Promise.all([
      syncAdSettingsToFirestoreRest(state.adSettings, 'published', actorUid, bearer),
      syncAdSettingsToFirestoreRest(state.adDraftSettings, 'draft', actorUid, bearer),
    ]);
    res.json({
      ok: true,
      adSettings: state.adSettings,
      draftSettings: state.adDraftSettings,
      firestoreSynced: pubSynced,
    });
  };

  app.post('/api/admin/ads/publish', handlePublishAdsRoute);
  app.post('/api/admin/ads', handlePublishAdsRoute);

  // ---------------------------------------------------------------------------
  // HERO BOX SELECTION ENDPOINT (Protected: Admin or Editor with manage_hero)
  // ---------------------------------------------------------------------------
  app.post('/api/hero-selection', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasStaffPermission(user, 'manage_hero')) {
      res.status(403).json({
        error: 'Authorization required: Admin or Editor permission (manage_hero) needed.',
      });
      return;
    }

    const storyId = typeof req.body?.storyId === 'string' ? req.body.storyId.trim() : '';
    const target = state.stories.find((s) => s.id === storyId);
    if (!target) {
      res.status(404).json({ error: 'Story not found.' });
      return;
    }

    for (const s of state.stories) {
      if (s.language === target.language) {
        const nextHero = s.id === target.id;
        if (s.isFeaturedHero !== nextHero) {
          s.isFeaturedHero = nextHero;
          void syncStoryToFirestoreRest(s, extractBearerToken(req));
        }
      }
    }
    saveState();

    const sorted = sortStoriesNewestFirst(state.stories);
    res.json({
      stories: sorted,
      selectedHeroId: target.id,
    });
  });

  // ---------------------------------------------------------------------------
  // FIREBASE AUTHENTICATION SESSION EXCHANGE (Verified ID Token Required)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/firebase', async (req: Request, res: Response) => {
    if (!getFirebaseRuntimeConfig().projectId) {
      res.status(503).json({
        error: 'Firebase authentication is currently disabled while awaiting new Firebase project setup.',
      });
      return;
    }

    const tokenFromHeader = extractBearerToken(req);
    const tokenFromBody = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
    const idToken = tokenFromHeader || tokenFromBody;

    if (!idToken) {
      res.status(401).json({ error: 'Firebase ID token is required.' });
      return;
    }

    const verified = await verifyIdTokenFn(idToken);
    if (!verified) {
      res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
      return;
    }

    const preferredLanguage: Language | undefined =
      req.body?.language === 'hi' ? 'hi' : req.body?.language === 'bn' ? 'bn' : undefined;
    const user = await resolveFirebaseUserProfile(idToken, verified, preferredLanguage);

    res.json({
      user,
      orders: state.orders.filter((o) => o.userId === user.id),
      progress: state.progressByUser[user.id] || [],
    });
  });

  // ---------------------------------------------------------------------------
  // LISTENER-ONLY EMAIL LOGIN / FREE REGISTRATION (Zero Admin/Editor Elevation)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const nameRaw = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const preferredLanguage: Language = req.body?.language === 'hi' ? 'hi' : 'bn';

    if (!emailRaw || !emailRaw.includes('@')) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }

    const envOwnerEmails = [
      ...(process.env.OWNER_ADMIN_EMAILS || '').split(','),
      ...(process.env.ADMIN_EMAIL || '').split(','),
    ]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const existing = Object.values(state.users).find((u) => u.email.toLowerCase() === emailRaw);
    const isStaffAccount =
      envOwnerEmails.includes(emailRaw) ||
      Boolean(state.editors?.[emailRaw]) ||
      existing?.role === 'admin' ||
      existing?.role === 'editor';

    if (isStaffAccount || existing?.firebaseUid) {
      res.status(403).json({
        error:
          'Google/Firebase-linked, Administrator, and Editor accounts must sign in securely via Firebase Authentication.',
      });
      return;
    }

    let listenerUser = existing;
    if (!listenerUser) {
      const newId = `usr_${crypto.randomBytes(6).toString('hex')}`;
      listenerUser = {
        id: newId,
        name: nameRaw || emailRaw.split('@')[0],
        email: emailRaw,
        role: 'listener',
        preferredLanguage,
        purchasedStoryIds: [],
        storyEntitlements: {},
        membership: {
          planId: 'npass_monthly_9',
          priceInr: NPASS_MONTHLY_PRICE_INR,
          status: 'INACTIVE',
        },
      };
      state.users[newId] = listenerUser;
    } else if (nameRaw) {
      listenerUser.name = nameRaw;
    }

    ensureUserEntitlements(listenerUser);
    const token = crypto.randomBytes(24).toString('hex');
    state.sessions[token] = listenerUser.id;
    saveState();

    res.json({
      token,
      user: listenerUser,
      orders: state.orders.filter((o) => o.userId === listenerUser.id),
      progress: state.progressByUser[listenerUser.id] || [],
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      delete state.sessions[token];
      saveState();
    }
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // LISTENING PROGRESS PERSISTENCE
  // ---------------------------------------------------------------------------
  app.post('/api/progress', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required to sync progress.' });
      return;
    }
    const { storyId, episodeId, isTrailer, positionSeconds, durationSeconds } = req.body || {};
    if (typeof storyId !== 'string' || typeof episodeId !== 'string') {
      res.status(400).json({ error: 'Invalid playback progress payload.' });
      return;
    }

    const list = state.progressByUser[user.id] || [];
    const idx = list.findIndex((p) => p.storyId === storyId && p.episodeId === episodeId);
    const updated: PlaybackProgress = {
      storyId,
      episodeId,
      isTrailer: Boolean(isTrailer),
      positionSeconds: Math.max(0, Number(positionSeconds) || 0),
      durationSeconds: Math.max(1, Number(durationSeconds) || 1),
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      list[idx] = updated;
    } else {
      list.unshift(updated);
    }
    state.progressByUser[user.id] = list.slice(0, 30);
    saveState();
    res.json({ progress: state.progressByUser[user.id] });
  });

  // ---------------------------------------------------------------------------
  // TICKET ORDER CREATION + VERIFICATION
  // ---------------------------------------------------------------------------
  app.post('/api/orders', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Please sign in before creating an order.' });
      return;
    }

    const itemType = req.body?.itemType === 'npass_monthly' ? 'npass_monthly' : 'story_ticket';
    const paymentMethod =
      req.body?.paymentMethod === 'card' || req.body?.paymentMethod === 'netbanking'
        ? req.body.paymentMethod
        : 'upi';
    const language: Language = req.body?.language === 'hi' ? 'hi' : 'bn';

    let amountInr = NPASS_MONTHLY_PRICE_INR;
    let itemTitle = 'N Pass Monthly Membership';
    let storyId: string | undefined;

    if (itemType === 'story_ticket') {
      const targetStory = state.stories.find((s) => s.id === req.body?.storyId);
      if (!targetStory) {
        res.status(404).json({ error: 'Requested story was not found.' });
        return;
      }
      if (targetStory.accessPolicy === 'npass_included') {
        res.status(400).json({ error: 'This item is available exclusively via N Pass.' });
        return;
      }
      amountInr = targetStory.ticketPriceInr;
      itemTitle = targetStory.title;
      storyId = targetStory.id;
    }

    const order: OrderRecord = {
      orderId: `GK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      userId: user.id,
      itemType,
      storyId,
      itemTitle,
      language,
      amountInr,
      paymentMethod,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    state.orders.unshift(order);
    saveState();
    void syncOrderToFirestoreRest(order);
    res.json({
      order,
      liveGatewayConnected: LIVE_GATEWAY_CONNECTED,
      sandboxModeEnabled: SANDBOX_PAYMENT_ALLOWED,
    });
  });

  function grantVerifiedOrderEntitlement(
    order: OrderRecord,
    user: UserProfile,
    opts: { isSandbox: boolean; gatewayPaymentId?: string },
  ): void {
    order.status = 'VERIFIED';
    order.failureReason = undefined;
    order.isSandboxVerification = opts.isSandbox;
    order.verifiedAt = new Date().toISOString();

    if (opts.gatewayPaymentId) {
      state.usedGatewayPaymentIds = state.usedGatewayPaymentIds || [];
      if (!state.usedGatewayPaymentIds.includes(opts.gatewayPaymentId)) {
        state.usedGatewayPaymentIds.push(opts.gatewayPaymentId);
      }
    }

    if (order.itemType === 'story_ticket' && order.storyId) {
      user.storyEntitlements = user.storyEntitlements || {};
      const existingEnt = user.storyEntitlements[order.storyId];
      const baseRemaining =
        existingEnt && existingEnt.remainingListens > 0 ? existingEnt.remainingListens : 0;
      const updatedEnt: StoryTicketEntitlement = {
        storyId: order.storyId,
        remainingListens: baseRemaining + MAX_LISTENS_PER_PURCHASE,
        totalListensUsed: existingEnt?.totalListensUsed ?? 0,
        completedEpisodeIdsInCycle: [],
        lastOrderId: order.orderId,
        lastCompletedAt: existingEnt?.lastCompletedAt,
        updatedAt: new Date().toISOString(),
      };
      user.storyEntitlements[order.storyId] = updatedEnt;
      ensureUserEntitlements(user);
    } else if (order.itemType === 'npass_monthly') {
      const now = new Date();
      const renews = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      user.membership = {
        planId: 'npass_monthly_9',
        priceInr: NPASS_MONTHLY_PRICE_INR,
        status: 'ACTIVE',
        activatedAt: now.toISOString(),
        renewsAt: renews.toISOString(),
        verifiedOrderId: order.orderId,
        isSandboxVerification: opts.isSandbox,
      };
    }

    saveState();
    void syncOrderToFirestoreRest(order);
    if (order.itemType === 'story_ticket' && order.storyId && user.storyEntitlements?.[order.storyId]) {
      void syncEntitlementToFirestoreRest(user, user.storyEntitlements[order.storyId]);
    }
  }

  app.post('/api/orders/:orderId/verify', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const order = state.orders.find((o) => o.orderId === req.params.orderId && o.userId === user.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    // Strict Idempotency: an already VERIFIED order must never grant duplicate listens
    if (order.status === 'VERIFIED') {
      res.json({
        verified: true,
        alreadyVerified: true,
        order,
        user,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    if (!LIVE_GATEWAY_CONNECTED || !gatewayCfg.keySecret) {
      if (order.status === 'PENDING') {
        order.status = 'FAILED';
        order.failureReason = 'LIVE_GATEWAY_NOT_AUTHORIZED';
        saveState();
      }
      res.status(503).json({
        verified: false,
        reason: 'LIVE_GATEWAY_NOT_AUTHORIZED',
        order,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    const gatewayPaymentId =
      typeof req.body?.razorpay_payment_id === 'string'
        ? req.body.razorpay_payment_id.trim()
        : typeof req.body?.gatewayPaymentId === 'string'
          ? req.body.gatewayPaymentId.trim()
          : '';
    const gatewayOrderId =
      typeof req.body?.razorpay_order_id === 'string'
        ? req.body.razorpay_order_id.trim()
        : typeof req.body?.gatewayOrderId === 'string'
          ? req.body.gatewayOrderId.trim()
          : order.orderId;
    const signature =
      typeof req.body?.razorpay_signature === 'string'
        ? req.body.razorpay_signature.trim()
        : typeof req.body?.signature === 'string'
          ? req.body.signature.trim()
          : '';
    const rawCurrency = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : 'INR';
    const rawAmountInr =
      typeof req.body?.amountInr === 'number'
        ? req.body.amountInr
        : typeof req.body?.amountPaise === 'number'
          ? req.body.amountPaise / 100
          : order.amountInr;

    if (!gatewayPaymentId || !signature) {
      order.status = 'FAILED';
      order.failureReason = 'MISSING_GATEWAY_SIGNATURE';
      saveState();
      res.status(400).json({
        verified: false,
        reason: 'MISSING_GATEWAY_SIGNATURE',
        order,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    if (rawCurrency !== 'INR' || Math.abs(rawAmountInr - order.amountInr) > 0.01) {
      order.status = 'FAILED';
      order.failureReason = 'AMOUNT_OR_CURRENCY_MISMATCH';
      saveState();
      res.status(400).json({
        verified: false,
        reason: 'AMOUNT_OR_CURRENCY_MISMATCH',
        order,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    if (state.usedGatewayPaymentIds?.includes(gatewayPaymentId)) {
      res.status(409).json({
        verified: false,
        reason: 'DUPLICATE_PAYMENT_ID',
        order,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    const signatureValid = verifyGatewayPaymentSignature({
      orderId: order.orderId,
      gatewayOrderId,
      gatewayPaymentId,
      signature,
      secret: gatewayCfg.keySecret,
    });
    if (!signatureValid) {
      order.status = 'FAILED';
      order.failureReason = 'INVALID_GATEWAY_SIGNATURE';
      saveState();
      res.status(400).json({
        verified: false,
        reason: 'INVALID_GATEWAY_SIGNATURE',
        order,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    grantVerifiedOrderEntitlement(order, user, {
      isSandbox: false,
      gatewayPaymentId,
    });
    res.json({
      verified: true,
      order,
      user,
      orders: state.orders.filter((o) => o.userId === user.id),
    });
  });

  app.post('/api/orders/webhook', (req: Request, res: Response) => {
    const webhookSecret = (gatewayCfg.webhookSecret || '').trim();
    if (!LIVE_GATEWAY_CONNECTED || !webhookSecret) {
      res.status(503).json({ error: 'Payment gateway webhook is not configured.' });
      return;
    }

    const sigHeader = String(
      req.headers['x-razorpay-signature'] || req.headers['x-gateway-signature'] || '',
    );
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyWebhookHmacSignature(rawBody, sigHeader, webhookSecret)) {
      res.status(401).json({ error: 'Invalid webhook signature.' });
      return;
    }

    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    const gatewayPaymentId =
      typeof req.body?.gatewayPaymentId === 'string' ? req.body.gatewayPaymentId.trim() : '';
    const currency =
      typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : '';
    const amountInr = Number(req.body?.amountInr);

    const order = state.orders.find((o) => o.orderId === orderId);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (order.status === 'VERIFIED') {
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    if (currency !== 'INR' || Number.isNaN(amountInr) || Math.abs(amountInr - order.amountInr) > 0.01) {
      res.status(400).json({ error: 'Amount or currency mismatch.' });
      return;
    }
    if (gatewayPaymentId && state.usedGatewayPaymentIds?.includes(gatewayPaymentId)) {
      res.status(409).json({ error: 'Duplicate gateway payment ID.' });
      return;
    }

    const ownerUser = state.users[order.userId];
    if (!ownerUser) {
      res.status(404).json({ error: 'Order owner not found.' });
      return;
    }

    grantVerifiedOrderEntitlement(order, ownerUser, {
      isSandbox: false,
      gatewayPaymentId: gatewayPaymentId || undefined,
    });
    res.json({ ok: true, verified: true, orderId: order.orderId });
  });

  app.post('/api/orders/:orderId/sandbox-verify', async (req: Request, res: Response) => {
    if (!SANDBOX_PAYMENT_ALLOWED) {
      res.status(403).json({
        verified: false,
        reason: 'SANDBOX_DISABLED',
        error: 'Sandbox payment verification is strictly disabled in production and live environments.',
      });
      return;
    }

    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const order = state.orders.find((o) => o.orderId === req.params.orderId && o.userId === user.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    if (order.status === 'VERIFIED') {
      res.json({
        verified: true,
        alreadyVerified: true,
        order,
        user,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    grantVerifiedOrderEntitlement(order, user, { isSandbox: true });
    res.json({
      verified: true,
      order,
      user,
      orders: state.orders.filter((o) => o.userId === user.id),
    });
  });

  // ---------------------------------------------------------------------------
  // SERVER-AUTHORITATIVE FULL-LISTEN TRACKING (MAX 2 FULL LISTENS PER ₹9 TICKET)
  // ---------------------------------------------------------------------------
  app.post('/api/stories/:storyId/complete-listen', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required to record story completion.' });
      return;
    }

    const story = state.stories.find((s) => s.id === req.params.storyId);
    if (!story) {
      res.status(404).json({ error: 'Story not found.' });
      return;
    }

    // Free content and Admin/Staff previews do not consume paid ticket listens
    if (
      story.ticketPriceInr <= 0 ||
      user.role === 'admin' ||
      hasStaffPermission(user, 'manage_stories')
    ) {
      res.json({
        ok: true,
        listenCompleted: false,
        unlimited: true,
        accessExpired: false,
        remainingListens: null,
        totalListensUsed: 0,
        user,
      });
      return;
    }

    ensureUserEntitlements(user);
    const hasNPass =
      user.membership.status === 'ACTIVE' &&
      (story.accessPolicy === 'npass_included' || story.accessPolicy === 'both');

    const ent = user.storyEntitlements?.[story.id];
    if (!ent || ent.remainingListens <= 0) {
      if (hasNPass) {
        res.json({
          ok: true,
          listenCompleted: false,
          unlimited: true,
          accessExpired: false,
          remainingListens: null,
          totalListensUsed: ent?.totalListensUsed ?? 0,
          user,
        });
        return;
      }
      res.status(403).json({
        error: 'এই ₹9 টিকিটে সর্বোচ্চ ২ বার পূর্ণ শোনা সম্পন্ন হয়েছে। ৩য় বার শুনতে অনুগ্রহ করে পুনরায় পেমেন্ট করুন।',
        accessExpired: true,
        remainingListens: 0,
        totalListensUsed: ent?.totalListensUsed ?? 0,
        user,
      });
      return;
    }

    const requestedEpId =
      typeof req.body?.episodeId === 'string' ? req.body.episodeId.trim() : '';
    const targetEpisode = requestedEpId
      ? story.episodes.find((ep) => ep.id === requestedEpId)
      : story.episodes.length === 1
        ? story.episodes[0]
        : undefined;

    if (!targetEpisode && story.episodes.length > 0) {
      res.status(400).json({ error: 'Valid episodeId is required for story completion.' });
      return;
    }

    const nowIso = new Date().toISOString();
    if (targetEpisode && !ent.completedEpisodeIdsInCycle.includes(targetEpisode.id)) {
      ent.completedEpisodeIdsInCycle.push(targetEpisode.id);
    }

    const allEpisodesDone =
      story.episodes.length === 0 ||
      story.episodes.every((ep) => ent.completedEpisodeIdsInCycle.includes(ep.id));

    let listenCompleted = false;
    if (allEpisodesDone) {
      ent.remainingListens = Math.max(0, ent.remainingListens - 1);
      ent.totalListensUsed += 1;
      ent.completedEpisodeIdsInCycle = [];
      ent.lastCompletedAt = nowIso;
      listenCompleted = true;
    }
    ent.updatedAt = nowIso;

    ensureUserEntitlements(user);

    const accessExpired = ent.remainingListens <= 0;
    if (accessExpired && state.progressByUser[user.id]) {
      state.progressByUser[user.id] = state.progressByUser[user.id].filter(
        (p) => !(p.storyId === story.id && !p.isTrailer),
      );
    }

    saveState();
    void syncEntitlementToFirestoreRest(user, ent);
    res.json({
      ok: true,
      listenCompleted,
      accessExpired,
      remainingListens: ent.remainingListens,
      totalListensUsed: ent.totalListensUsed,
      completedEpisodesInCycle: ent.completedEpisodeIdsInCycle.length,
      totalEpisodes: story.episodes.length,
      user,
      progress: state.progressByUser[user.id] || [],
    });
  });

  // ---------------------------------------------------------------------------
  // MEDIA PLAYBACK AUTHORIZATION (SHORT-LIVED SIGNED STREAM URLS)
  // ---------------------------------------------------------------------------
  app.post('/api/media/authorize', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    const storyId = typeof req.body?.storyId === 'string' ? req.body.storyId.trim() : '';
    const episodeId = typeof req.body?.episodeId === 'string' ? req.body.episodeId.trim() : '';
    const requestedFileName =
      typeof req.body?.fileName === 'string' ? req.body.fileName.trim() : '';
    const isTrailer = Boolean(req.body?.isTrailer);
    const mediaKind = req.body?.mediaKind === 'video' ? 'video' : 'audio';

    // Staff preview authorization for newly uploaded files not yet saved to a story
    if (!storyId && requestedFileName) {
      if (!user || (!hasStaffPermission(user, 'manage_media') && !hasStaffPermission(user, 'manage_stories'))) {
        res.status(user ? 403 : 401).json({ error: 'Authorized staff credentials required.' });
        return;
      }
      const safe = resolveSafeUploadPath(UPLOADS_DIR, requestedFileName);
      if (!safe) {
        res.status(400).json({ error: 'Invalid media filename.' });
        return;
      }
      const mt = createSignedMediaToken(
        MEDIA_SIGNING_SECRET,
        { fn: safe.fileName, uid: user.id },
        7200,
      );
      res.json({ streamUrl: `/api/uploads/${safe.fileName}?mt=${encodeURIComponent(mt)}` });
      return;
    }

    const story = state.stories.find((s) => s.id === storyId);
    if (!story) {
      res.status(404).json({ error: 'Story not found.' });
      return;
    }

    const isAuthorizedStaff =
      user?.role === 'admin' ||
      hasStaffPermission(user, 'manage_stories') ||
      hasStaffPermission(user, 'manage_media');

    if (story.publicationStatus !== 'published' && !isAuthorizedStaff) {
      res.status(403).json({ error: 'Draft content requires staff authorization.' });
      return;
    }

    if (isTrailer) {
      const rawTrailer = mediaKind === 'video' ? story.trailerVideoUrl : story.trailerAudioUrl;
      if (rawTrailer) {
        const clean = stripMediaTokenQuery(rawTrailer) || rawTrailer;
        const fn = extractUploadedFilenameFromUrl(clean);
        if (fn) {
          const mt = createSignedMediaToken(
            MEDIA_SIGNING_SECRET,
            { fn, sid: story.id, eid: 'trailer', uid: user?.id || 'guest' },
            7200,
          );
          res.json({ streamUrl: `/api/uploads/${fn}?mt=${encodeURIComponent(mt)}` });
          return;
        }
        res.json({ streamUrl: clean });
        return;
      }
      res.json({ streamUrl: `/api/audio/${encodeURIComponent(story.id)}/trailer/trailer.wav` });
      return;
    }

    const ep = episodeId ? story.episodes.find((e) => e.id === episodeId) : story.episodes[0];
    if (!ep) {
      res.status(404).json({ error: 'Episode not found.' });
      return;
    }

    const isFree = story.ticketPriceInr <= 0;
    if (!isFree && !isAuthorizedStaff) {
      if (!user) {
        res.status(401).json({ error: 'Authentication required for premium media.' });
        return;
      }
      if (!userHasStoryAccess(user, story)) {
        res.status(403).json({ error: 'Verified ticket or eligible active N-Pass required.' });
        return;
      }
    }

    const rawUrl = mediaKind === 'video' ? ep.videoUrl : ep.audioUrl;
    if (rawUrl) {
      const clean = stripMediaTokenQuery(rawUrl) || rawUrl;
      const fn = extractUploadedFilenameFromUrl(clean);
      if (fn) {
        const mt = createSignedMediaToken(
          MEDIA_SIGNING_SECRET,
          { fn, sid: story.id, eid: ep.id, uid: user?.id || 'guest' },
          7200,
        );
        res.json({ streamUrl: `/api/uploads/${fn}?mt=${encodeURIComponent(mt)}` });
        return;
      }
      res.json({ streamUrl: clean });
      return;
    }

    if (mediaKind === 'video') {
      res.status(404).json({ error: 'Video stream not attached to this episode.' });
      return;
    }

    const mt = createSignedMediaToken(
      MEDIA_SIGNING_SECRET,
      { sid: story.id, eid: ep.id, uid: user?.id || 'guest' },
      7200,
    );
    res.json({
      streamUrl: `/api/audio/${encodeURIComponent(story.id)}/episode/${encodeURIComponent(
        ep.id,
      )}.wav?mt=${encodeURIComponent(mt)}`,
    });
  });

  // ---------------------------------------------------------------------------
  // PROTECTED AUDIO STREAMING WITH RANGE SUPPORT (TRAILERS + ENTITLED EPISODES)
  // ---------------------------------------------------------------------------
  app.get('/api/audio/:storyId/:trackType/:trackId.wav', async (req: Request, res: Response) => {
    const { storyId, trackType, trackId } = req.params;
    const story = state.stories.find((s) => s.id === storyId);
    if (!story) {
      res.status(404).send('Story not found');
      return;
    }

    let audioKey = story.trailerAudioKey;
    let durationSeconds = story.trailerDurationSeconds || 40;

    if (trackType === 'episode') {
      const isFree = story.ticketPriceInr <= 0 && story.publicationStatus === 'published';
      const mtQuery = typeof req.query.mt === 'string' ? req.query.mt.trim() : '';
      const verifiedMt = mtQuery ? verifySignedMediaToken(MEDIA_SIGNING_SECRET, mtQuery) : null;
      const validSignedToken = Boolean(
        verifiedMt && verifiedMt.sid === story.id && verifiedMt.eid === trackId,
      );

      if (!isFree && !validSignedToken) {
        const user = await resolveAuthenticatedUser(req);
        const isAuthorizedStaff =
          user?.role === 'admin' || hasStaffPermission(user, 'manage_stories');
        if (!user) {
          res.status(401).json({
            error: 'Authentication required to stream this episode.',
          });
          return;
        }
        if (!isAuthorizedStaff && !userHasStoryAccess(user, story)) {
          res.status(403).json({
            error: 'Verified ticket or eligible active membership is required to stream this episode.',
          });
          return;
        }
      }

      const ep = story.episodes.find((e) => e.id === trackId);
      if (!ep) {
        res.status(404).send('Episode not found');
        return;
      }
      audioKey = ep.audioKey;
      durationSeconds = ep.durationSeconds || 75;
    }

    const cacheKey = `${audioKey}_${durationSeconds}`;
    let wavBuffer = audioBufferCache.get(cacheKey);
    if (!wavBuffer) {
      wavBuffer = synthesizeAtmosphericWav(audioKey, durationSeconds);
      audioBufferCache.set(cacheKey, wavBuffer);
    }

    const totalLength = wavBuffer.length;
    const range = req.headers.range;

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? Math.min(totalLength - 1, parseInt(match[2], 10)) : totalLength - 1;
        if (start < totalLength && start <= end) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
          res.setHeader('Content-Length', String(end - start + 1));
          res.end(wavBuffer.subarray(start, end + 1));
          return;
        }
      }
    }

    res.status(200);
    res.setHeader('Content-Length', String(totalLength));
    res.end(wavBuffer);
  });

  // ---------------------------------------------------------------------------
  // AUTHORIZED RBAC ADMIN & EDITOR STUDIO ENDPOINTS (STRICT SERVER VERIFICATION)
  // ---------------------------------------------------------------------------

  app.get('/api/admin/overview', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasAnyStaffAccess(user)) {
      res.status(403).json({ error: 'Authorized Admin or Editor credentials required.' });
      return;
    }

    const isOwnerAdmin = user?.role === 'admin';
    res.json({
      stories: sortStoriesNewestFirst(state.stories),
      categories: computeCategories(),
      orders: isOwnerAdmin ? state.orders : [],
      users: isOwnerAdmin ? Object.values(state.users) : [],
      editors: isOwnerAdmin ? Object.values(state.editors || {}) : [],
      nPassPriceInr: isOwnerAdmin
        ? state.nPassMonthlyPriceInr || NPASS_MONTHLY_PRICE_INR
        : undefined,
      adSettings: normalizeAdSettings(state.adSettings, 'published'),
      adDraftSettings: normalizeAdSettings(
        state.adDraftSettings || state.adSettings,
        'draft',
      ),
    });
  });

  // Owner/Admin Only: List, Add/Update, or Revoke Editor Permissions
  app.get('/api/admin/editors', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to manage editors.' });
      return;
    }
    res.json({ editors: Object.values(state.editors || {}) });
  });

  app.post('/api/admin/editors', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to manage editors.' });
      return;
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const uid = typeof req.body?.uid === 'string' ? req.body.uid.trim() : undefined;
    const permissions = sanitizeEditorPermissions(req.body?.permissions);

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Valid editor email address is required.' });
      return;
    }
    if (permissions.length === 0) {
      res.status(400).json({ error: 'At least one content permission must be granted.' });
      return;
    }
    if (email === user.email.toLowerCase()) {
      res.status(400).json({ error: 'Owner/Admin cannot be downgraded to an Editor.' });
      return;
    }

    state.editors = state.editors || {};
    const existing = state.editors[email];
    const nowIso = new Date().toISOString();

    state.editors[email] = {
      uid: uid || existing?.uid,
      email,
      name: name || existing?.name || email.split('@')[0],
      permissions,
      grantedBy: user.firebaseUid || user.id,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    // Sync cached user profile immediately if already registered
    for (const u of Object.values(state.users)) {
      if (u.email.toLowerCase() === email && u.role !== 'admin') {
        u.role = 'editor';
        u.permissions = permissions;
        if (name) u.name = name;
      }
    }

    saveState();
    void syncEditorToFirestoreRest(state.editors[email], extractBearerToken(req));
    res.json({ editors: Object.values(state.editors) });
  });

  app.delete('/api/admin/editors/:email', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to revoke editors.' });
      return;
    }

    const email = decodeURIComponent(req.params.email || '').trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'Editor email is required.' });
      return;
    }

    let deletedUid: string | undefined;
    if (state.editors && state.editors[email]) {
      deletedUid = state.editors[email].uid;
      delete state.editors[email];
    }

    for (const u of Object.values(state.users)) {
      if (u.email.toLowerCase() === email && u.role === 'editor') {
        u.role = 'listener';
        u.permissions = undefined;
      }
    }

    saveState();
    if (deletedUid) {
      void deleteEditorFromFirestoreRest(deletedUid, extractBearerToken(req));
    }
    res.json({ editors: Object.values(state.editors || {}) });
  });

  // Upload custom audio, video, or image files (Requires manage_media + MIME/magic-byte/size/overwrite protections)
  app.post('/api/admin/upload-media', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!hasStaffPermission(user, 'manage_media')) {
      res.status(403).json({ error: 'Permission required: manage_media.' });
      return;
    }

    const { fileData, fileName, mediaType, mimeType, accessTier: rawTier } = req.body || {};
    if (!fileData || typeof fileData !== 'string') {
      res.status(400).json({ error: 'File data is required.' });
      return;
    }

    try {
      let buffer: Buffer;
      let parsedMime = typeof mimeType === 'string' ? mimeType : '';

      if (fileData.startsWith('data:')) {
        const matches = fileData.match(/^data:([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+)(?:;[A-Za-z0-9=_-]+)*;base64,(.+)$/);
        if (!matches || !matches[2]) {
          res.status(400).json({ error: 'Invalid data URI media payload.' });
          return;
        }
        parsedMime = matches[1].toLowerCase();
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(fileData, 'base64');
      }

      if (!buffer || buffer.length === 0) {
        res.status(400).json({ error: 'Uploaded media payload is empty.' });
        return;
      }

      const specResult = resolveExtensionSpec(
        typeof fileName === 'string' ? fileName : undefined,
        parsedMime,
        typeof mediaType === 'string' ? mediaType : undefined,
      );
      if (!specResult) {
        res.status(400).json({ error: 'Unsupported or disallowed file extension / MIME type.' });
        return;
      }

      const { spec, resolvedExt } = specResult;
      if (buffer.length > spec.maxBytes) {
        res.status(413).json({
          error: `File exceeds maximum allowed size (${Math.round(spec.maxBytes / (1024 * 1024))} MB).`,
        });
        return;
      }

      if (!verifyMediaMagicBytes(buffer.subarray(0, 64), resolvedExt)) {
        res.status(400).json({
          error: 'File signature mismatch: content does not match declared media format.',
        });
        return;
      }

      const accessTier: MediaTier =
        spec.kind === 'image' ? 'free' : rawTier === 'premium' ? 'premium' : 'free';
      const safeName = createUniqueUploadFilename(
        typeof fileName === 'string' ? fileName : undefined,
        resolvedExt,
        accessTier,
      );
      const resolved = resolveSafeUploadPath(UPLOADS_DIR, safeName);
      if (!resolved) {
        res.status(400).json({ error: 'Generated filename rejected by path policy.' });
        return;
      }

      // Atomic create (O_EXCL): never overwrites existing files
      fs.writeFileSync(resolved.targetPath, buffer, { flag: 'wx' });

      const gcsObjectPath = await mirrorUploadToGcsIfAvailable({
        filePath: resolved.targetPath,
        fileName: resolved.fileName,
        accessTier,
        folder: spec.folder,
        mimeType: spec.mime,
      });

      mediaManifest[resolved.fileName] = {
        fileName: resolved.fileName,
        accessTier,
        folder: spec.folder,
        mediaType: spec.kind,
        mimeType: spec.mime,
        sizeBytes: buffer.length,
        uploadedByUid: user.firebaseUid || user.id,
        gcsObjectPath,
        createdAt: new Date().toISOString(),
      };
      saveMediaManifest();

      const canonicalUrl = `/api/uploads/${resolved.fileName}`;
      const previewToken = createSignedMediaToken(
        MEDIA_SIGNING_SECRET,
        { fn: resolved.fileName, uid: user.id },
        7200,
      );
      res.json({
        url: canonicalUrl,
        previewUrl: `${canonicalUrl}?mt=${encodeURIComponent(previewToken)}`,
        fileName: resolved.fileName,
        accessTier,
        sizeBytes: buffer.length,
        mediaType: spec.kind,
      });
    } catch {
      res.status(500).json({ error: 'Failed to process and store media file.' });
    }
  });

  // Chunked Resumable Upload Protocol (Supports up to 150MB audio/video cleanly with progress %)
  app.post('/api/admin/upload-media/init', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!hasStaffPermission(user, 'manage_media')) {
      res.status(403).json({ error: 'Permission required: manage_media.' });
      return;
    }

    const { fileName, fileSize, mediaType, mimeType, accessTier: rawTier } = req.body || {};
    const sizeNum = Number(fileSize);
    if (!fileName || typeof fileName !== 'string' || !Number.isFinite(sizeNum) || sizeNum <= 0) {
      res.status(400).json({ error: 'Valid fileName and positive fileSize are required.' });
      return;
    }

    const specResult = resolveExtensionSpec(
      fileName,
      typeof mimeType === 'string' ? mimeType : '',
      typeof mediaType === 'string' ? mediaType : undefined,
    );
    if (!specResult) {
      res.status(400).json({ error: 'Unsupported or disallowed file type.' });
      return;
    }

    const { spec, resolvedExt } = specResult;
    if (sizeNum > spec.maxBytes) {
      res.status(413).json({
        error: `File exceeds maximum allowed size (${Math.round(spec.maxBytes / (1024 * 1024))} MB).`,
      });
      return;
    }

    pruneExpiredUploadSessions();
    const userActiveSessions = Array.from(uploadSessions.values()).filter(
      (s) => s.userId === user.id,
    ).length;
    if (
      userActiveSessions >= MAX_UPLOAD_SESSIONS_PER_USER ||
      uploadSessions.size >= MAX_TOTAL_UPLOAD_SESSIONS
    ) {
      res.status(429).json({
        error: 'Too many concurrent upload sessions in progress. Please wait and retry.',
      });
      return;
    }

    const accessTier: MediaTier =
      spec.kind === 'image' ? 'free' : rawTier === 'premium' ? 'premium' : 'free';
    const uploadId = crypto.randomBytes(16).toString('hex');
    const tempPath = path.join(CHUNK_STAGING_DIR, `${uploadId}.part`);

    uploadSessions.set(uploadId, {
      uploadId,
      userId: user.id,
      originalName: fileName,
      mediaType: spec.kind,
      folder: spec.folder,
      mimeType: spec.mime,
      resolvedExt,
      accessTier,
      expectedSize: sizeNum,
      maxBytes: spec.maxBytes,
      tempPath,
      bytesWritten: 0,
      createdAt: Date.now(),
    });

    res.json({ uploadId, chunkSize: 4 * 1024 * 1024 });
  });

  app.put(
    '/api/admin/upload-media/chunk/:uploadId',
    express.raw({ type: 'application/octet-stream', limit: '8mb' }),
    async (req: Request, res: Response) => {
      const user = await resolveAuthenticatedUser(req);
      if (!user || !hasStaffPermission(user, 'manage_media')) {
        res.status(user ? 403 : 401).json({ error: 'Permission required: manage_media.' });
        return;
      }

      pruneExpiredUploadSessions();
      const session = uploadSessions.get(req.params.uploadId);
      if (!session || session.userId !== user.id) {
        res.status(404).json({ error: 'Upload session not found or expired.' });
        return;
      }

      const chunk = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (chunk.length === 0) {
        res.status(400).json({ error: 'Empty upload chunk.' });
        return;
      }
      if (session.bytesWritten + chunk.length > session.maxBytes || session.bytesWritten + chunk.length > session.expectedSize) {
        uploadSessions.delete(session.uploadId);
        fs.rmSync(session.tempPath, { force: true });
        res.status(413).json({ error: 'Uploaded data exceeded declared or allowed file size.' });
        return;
      }

      fs.appendFileSync(session.tempPath, chunk);
      session.bytesWritten += chunk.length;
      res.json({ bytesWritten: session.bytesWritten, expectedSize: session.expectedSize });
    },
  );

  app.post('/api/admin/upload-media/complete/:uploadId', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || !hasStaffPermission(user, 'manage_media')) {
      res.status(user ? 403 : 401).json({ error: 'Permission required: manage_media.' });
      return;
    }

    const session = uploadSessions.get(req.params.uploadId);
    if (!session || session.userId !== user.id) {
      res.status(404).json({ error: 'Upload session not found.' });
      return;
    }
    uploadSessions.delete(session.uploadId);

    try {
      if (!fs.existsSync(session.tempPath) || session.bytesWritten !== session.expectedSize) {
        fs.rmSync(session.tempPath, { force: true });
        res.status(400).json({ error: 'Incomplete upload stream.' });
        return;
      }

      const fd = fs.openSync(session.tempPath, 'r');
      const head = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, head, 0, 64, 0);
      fs.closeSync(fd);

      if (!verifyMediaMagicBytes(head.subarray(0, bytesRead), session.resolvedExt)) {
        fs.rmSync(session.tempPath, { force: true });
        res.status(400).json({
          error: 'File signature mismatch: content does not match declared media format.',
        });
        return;
      }

      const safeName = createUniqueUploadFilename(
        session.originalName,
        session.resolvedExt,
        session.accessTier,
      );
      const resolved = resolveSafeUploadPath(UPLOADS_DIR, safeName);
      if (!resolved || fs.existsSync(resolved.targetPath)) {
        fs.rmSync(session.tempPath, { force: true });
        res.status(409).json({ error: 'Target upload collision or unsafe filename.' });
        return;
      }

      fs.renameSync(session.tempPath, resolved.targetPath);

      const gcsObjectPath = await mirrorUploadToGcsIfAvailable({
        filePath: resolved.targetPath,
        fileName: resolved.fileName,
        accessTier: session.accessTier,
        folder: session.folder,
        mimeType: session.mimeType,
      });

      mediaManifest[resolved.fileName] = {
        fileName: resolved.fileName,
        accessTier: session.accessTier,
        folder: session.folder,
        mediaType: session.mediaType,
        mimeType: session.mimeType,
        sizeBytes: session.bytesWritten,
        uploadedByUid: user.firebaseUid || user.id,
        gcsObjectPath,
        createdAt: new Date().toISOString(),
      };
      saveMediaManifest();

      const canonicalUrl = `/api/uploads/${resolved.fileName}`;
      const previewToken = createSignedMediaToken(
        MEDIA_SIGNING_SECRET,
        { fn: resolved.fileName, uid: user.id },
        7200,
      );
      res.json({
        url: canonicalUrl,
        previewUrl: `${canonicalUrl}?mt=${encodeURIComponent(previewToken)}`,
        fileName: resolved.fileName,
        accessTier: session.accessTier,
        sizeBytes: session.bytesWritten,
        mediaType: session.mediaType,
      });
    } catch {
      fs.rmSync(session.tempPath, { force: true });
      res.status(500).json({ error: 'Failed to finalize uploaded media file.' });
    }
  });

  // Automatic Bengali-to-Hindi story translation (Requires translate_stories)
  app.post('/api/admin/translate', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasStaffPermission(user, 'translate_stories')) {
      res.status(403).json({ error: 'Permission required: translate_stories.' });
      return;
    }

    const { title, subtitle, genre, synopsis, episodes } = req.body || {};

    const dictionary: Record<string, string> = {
      'রহস্য-রোমাঞ্চ': 'रहस्य-रोमांच',
      'ভৌতিক': 'अलौकिक / हॉरर',
      'গোয়েন্দা': 'जासूसी रहस्य',
      'লোকজ থ্রিলার': 'लोककथा थ्रिलर',
      'মনস্তাত্ত্বিক থ্রিলার': 'मनोवैज्ञानिक थ्रिलर',
      'অতিপ্রাকৃতিক থ্রিলার': 'अलौकिक थ्रिलर',
      'ডার্ক ফ্যান্টাসি': 'डार्क फैंटेसी',
      'লোকজ অ্যানিমেশন': 'लोकज एनीमेशन',
      'অ্যানিমেশন থ্রিলার': 'एनीमेशन थ्रिलर',
      'ঐতিহাসিক রহস্য': 'ऐतिहासिक रहस्य',
      'সিনেমাটিক ফিল্ম': 'सिनेमैटिक फिल्म',
      'নাটকীয় ফিল্ম': 'नाटकीय फिल्म',
      'কুয়াশার ডাক': 'कोहरे की पुकार',
      'নীল পদ্মের রহস্য': 'नील कमल का रहस्य',
      'অভিশপ্ত জমিদার বাড়ি': 'शापित हवेली की दास्तान',
      'শালবনের শেষ প্রহরী': 'साल के जंगल का आखिरी पहरेदार',
      'বনবিবির অরণ্য গাথা': 'वनदेवी की अरण्य गाथा',
      'পর্ব ১: সূচনা': 'अध्याय 1: आरंभ',
      'পর্ব ১': 'अध्याय 1',
      'পর্ব ২': 'अध्याय 2',
      'পর্ব ৩': 'अध्याय 3',
      'পর্ব ৪': 'अध्याय 4',
      'পর্ব ৫': 'अध्याय 5',
    };

    const simpleTranslate = (text: string): string => {
      if (!text) return '';
      let out = text;
      for (const [k, v] of Object.entries(dictionary)) {
        out = out.replace(new RegExp(k, 'g'), v);
      }
      out = out
        .replace(/পর্ব\s*([০-৯0-9]+)/g, 'अध्याय $1')
        .replace(/১/g, '1')
        .replace(/২/g, '2')
        .replace(/৩/g, '3')
        .replace(/৪/g, '4')
        .replace(/৫/g, '5')
        .replace(/৬/g, '6')
        .replace(/৭/g, '7')
        .replace(/৮/g, '8')
        .replace(/৯/g, '9')
        .replace(/০/g, '0');
      return out;
    };

    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI();
        const prompt = `You are an expert bilingual Bengali-to-Hindi literary translator for 'Goppo Kahini', a premium audio storytelling and video entertainment platform.
Translate the following Bengali story metadata into evocative, cinematic Hindi (Devanagari script):
Title: ${title || ''}
Subtitle: ${subtitle || ''}
Genre: ${genre || ''}
Synopsis: ${synopsis || ''}
Episodes: ${JSON.stringify(episodes || [])}

Respond with strictly valid JSON in this exact structure:
{
  "title": "Hindi translated title",
  "subtitle": "Hindi translated subtitle",
  "genre": "Hindi translated genre",
  "synopsis": "Hindi translated synopsis",
  "episodes": [
    { "title": "Hindi episode title", "synopsis": "Hindi episode synopsis" }
  ]
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });

        const rawText = response.text || '';
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        res.json({
          success: true,
          source: 'gemini-3.8-flash',
          translation: {
            title: parsed.title || simpleTranslate(title),
            subtitle: parsed.subtitle || simpleTranslate(subtitle),
            genre: parsed.genre || simpleTranslate(genre),
            synopsis: parsed.synopsis || simpleTranslate(synopsis),
            episodes: Array.isArray(parsed.episodes)
              ? parsed.episodes
              : (episodes || []).map((ep: { title: string; synopsis?: string }) => ({
                  title: simpleTranslate(ep.title),
                  synopsis: simpleTranslate(ep.synopsis || ''),
                })),
          },
        });
        return;
      } catch {
        // Fall back gracefully to built-in dictionary
      }
    }

    const fallbackEpisodes = (episodes || []).map((ep: { title: string; synopsis?: string }) => ({
      title: simpleTranslate(ep.title) || `अध्याय ${ep.title.replace(/[^0-9]/g, '') || '1'}`,
      synopsis: simpleTranslate(ep.synopsis || ''),
    }));

    res.json({
      success: true,
      source: 'offline-dictionary',
      translation: {
        title: dictionary[title] || `${simpleTranslate(title)} (हिंदी रूपांतरण)`,
        subtitle: simpleTranslate(subtitle) || 'एक रहस्यमयी और रोमांचक दास्तान',
        genre: dictionary[genre] || 'रहस्य-रोमांच',
        synopsis: simpleTranslate(synopsis) || synopsis,
        episodes: fallbackEpisodes,
      },
    });
  });

  // Serve stored uploads with path traversal protection, MIME hardening, and premium entitlement control
  app.get('/api/uploads/:fileName', async (req: Request, res: Response) => {
    const resolved = resolveSafeUploadPath(UPLOADS_DIR, req.params.fileName || '');
    if (!resolved) {
      res.status(400).json({ error: 'Invalid media filename or unsafe path.' });
      return;
    }

    const { fileName, targetPath } = resolved;
    const accessInfo = isUploadFilePubliclyAccessible(fileName);

    if (!accessInfo.isPublicFree) {
      const mtQuery = typeof req.query.mt === 'string' ? req.query.mt.trim() : '';
      const verifiedMt = mtQuery ? verifySignedMediaToken(MEDIA_SIGNING_SECRET, mtQuery) : null;
      const validSignedToken = Boolean(verifiedMt && verifiedMt.fn === fileName);

      if (!validSignedToken) {
        const user = await resolveAuthenticatedUser(req);
        if (!user) {
          res.status(401).json({ error: 'Authentication required to access protected media.' });
          return;
        }
        const isStaff =
          user.role === 'admin' ||
          hasStaffPermission(user, 'manage_stories') ||
          hasStaffPermission(user, 'manage_media');

        const hasEntitledStory =
          !accessInfo.isDraftOnly &&
          accessInfo.owningStories.some((s) => userHasStoryAccess(user, s));

        if (!isStaff && !hasEntitledStory) {
          res.status(403).json({
            error: 'Verified ticket, eligible N-Pass, or authorized staff access required.',
          });
          return;
        }
      }
    }

    const manifest = mediaManifest[fileName];
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const specResult = resolveExtensionSpec(fileName, manifest?.mimeType, manifest?.mediaType);
    const safeMime = manifest?.mimeType || specResult?.spec.mime || 'application/octet-stream';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader(
      'Cache-Control',
      accessInfo.isPublicFree ? 'public, max-age=86400' : 'private, no-store',
    );
    res.setHeader('Accept-Ranges', 'bytes');

    if (fs.existsSync(targetPath)) {
      res.setHeader('Content-Type', safeMime);
      res.sendFile(targetPath);
      return;
    }

    const gcsCandidates: string[] = [];
    if (manifest?.gcsObjectPath) {
      gcsCandidates.push(manifest.gcsObjectPath);
    } else if (specResult) {
      gcsCandidates.push(`stories/${accessInfo.inferredTier}/${specResult.spec.folder}/${fileName}`);
      const altTier = accessInfo.inferredTier === 'premium' ? 'free' : 'premium';
      gcsCandidates.push(`stories/${altTier}/${specResult.spec.folder}/${fileName}`);
    }

    for (const candidateObj of gcsCandidates) {
      const gcsRes = await fetchFromGcsFallback(candidateObj, req.headers.range);
      if (gcsRes) {
        res.status(gcsRes.status);
        res.setHeader('Content-Type', safeMime);
        if (gcsRes.contentRange) res.setHeader('Content-Range', gcsRes.contentRange);
        if (gcsRes.contentLength) res.setHeader('Content-Length', gcsRes.contentLength);
        res.end(gcsRes.body);
        return;
      }
    }

    res.status(404).send(`Uploaded media (${ext || 'unknown'}) not found.`);
  });

  app.put('/api/admin/categories', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasStaffPermission(user, 'manage_categories')) {
      res.status(403).json({ error: 'Permission required: manage_categories.' });
      return;
    }
    const categoryId = req.body?.categoryId as ContentCategory;
    const enabled = Boolean(req.body?.enabled);
    if (!['audio', 'animation', 'films'].includes(categoryId)) {
      res.status(400).json({ error: 'Invalid category.' });
      return;
    }
    state.categoryToggles[categoryId] = enabled;
    saveState();
    void syncCategoryToFirestoreRest(
      categoryId,
      enabled,
      user?.firebaseUid || user?.id || 'admin',
      extractBearerToken(req),
    );
    res.json({ categories: computeCategories() });
  });

  app.post('/api/admin/stories', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasStaffPermission(user, 'manage_stories')) {
      res.status(403).json({ error: 'Permission required: manage_stories.' });
      return;
    }
    const body = req.body as Partial<StoryItem>;
    if (!body?.title || !body?.language || !body?.genre) {
      res.status(400).json({ error: 'Language, title, and genre are required.' });
      return;
    }

    const rawId = body.id && typeof body.id === 'string' ? body.id.trim() : '';
    const id =
      (rawId.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '').slice(0, 128)) ||
      `${body.language === 'hi' ? 'hi' : 'bn'}-${crypto.randomBytes(4).toString('hex')}`;

    const accessPolicy: AccessPolicy =
      body.accessPolicy === 'ticket_only' || body.accessPolicy === 'npass_included'
        ? body.accessPolicy
        : 'both';

    const canSetHero = hasStaffPermission(user, 'manage_hero');
    const existingStory = state.stories.find((s) => s.id === id);
    const desiredHero = canSetHero
      ? Boolean(body.isFeaturedHero)
      : Boolean(existingStory?.isFeaturedHero);

    const nowIso = new Date().toISOString();
    const clampedPrice =
      body.ticketPriceInr === 0
        ? 0
        : Math.min(50000, Math.max(1, Number(body.ticketPriceInr) || DEFAULT_TICKET_PRICE_INR));
    const safeCollections =
      Array.isArray(body.collections) && body.collections.length > 0
        ? body.collections.filter((c) => typeof c === 'string' && c.length > 0).slice(0, 10)
        : existingStory?.collections || ['new'];

    const newStory: StoryItem = {
      id,
      language: body.language === 'hi' ? 'hi' : 'bn',
      category:
        body.category === 'animation' || body.category === 'films'
          ? body.category
          : 'audio',
      collections: safeCollections as StoryItem['collections'],
      isFeaturedHero: desiredHero,
      updatedAt: nowIso,
      title: body.title.trim().slice(0, 200),
      subtitle: (body.subtitle?.trim() || '').slice(0, 300),
      synopsis: (body.synopsis?.trim() || '').slice(0, 3000),
      writer: (body.writer?.trim() || 'Goppo Kahini Studio').slice(0, 120),
      narrator: (body.narrator?.trim() || 'Goppo Kahini Ensemble').slice(0, 120),
      genre: body.genre.trim().slice(0, 100),
      coverArt: (body.coverArt?.trim() || (body.language === 'hi' ? 'hi_cover_haveli' : 'bn_cover_salbon')).slice(0, 500),
      heroArt: (body.heroArt?.trim() || body.coverArt?.trim() || (body.language === 'hi' ? 'hi_hero_ghat' : 'bn_hero_zamindar')).slice(0, 500),
      mediaType:
        body.mediaType ||
        (body.category === 'animation' || body.category === 'films' ? 'video' : 'audio'),
      trailerTitle: (body.trailerTitle?.trim() || `Trailer — ${body.title.trim()}`).slice(0, 220),
      trailerDurationLabel: (body.trailerDurationLabel || '00:45').slice(0, 20),
      trailerDurationSeconds: Math.min(36000, Math.max(0, Number(body.trailerDurationSeconds) || 40)),
      trailerAudioKey: `${id}_trailer`.slice(0, 140),
      trailerAudioUrl: stripMediaTokenQuery(body.trailerAudioUrl),
      trailerVideoUrl: stripMediaTokenQuery(body.trailerVideoUrl),
      totalDurationLabel: (body.totalDurationLabel || '20m').slice(0, 30),
      ticketPriceInr: clampedPrice,
      accessPolicy,
      publicationStatus: body.publicationStatus === 'draft' ? 'draft' : 'published',
      releaseYear: Math.min(2100, Math.max(1900, Number(body.releaseYear) || 2026)),
      episodes:
        Array.isArray(body.episodes) && body.episodes.length > 0
          ? body.episodes.slice(0, 100).map((ep, index) => ({
              id: (ep.id || `${id}-ep-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
              number: index + 1,
              title: (ep.title || `Episode ${index + 1}`).slice(0, 200),
              durationLabel: (ep.durationLabel || '14:00').slice(0, 20),
              durationSeconds: Math.min(86400, Math.max(1, Number(ep.durationSeconds) || 75)),
              audioKey: (ep.audioKey || `${id}_ep_${index + 1}`).slice(0, 140),
              audioUrl: stripMediaTokenQuery(ep.audioUrl),
              videoUrl: stripMediaTokenQuery(ep.videoUrl),
              mediaType:
                ep.mediaType ||
                (body.category === 'animation' || body.category === 'films' ? 'video' : 'audio'),
              synopsis: (ep.synopsis || '').slice(0, 1000),
            }))
          : [
              {
                id: `${id}-ep-1`,
                number: 1,
                title: body.language === 'hi' ? 'अध्याय 1' : 'পর্ব ১',
                durationLabel: '15:00',
                durationSeconds: 75,
                audioKey: `${id}_ep_1`,
                synopsis: (body.synopsis?.trim() || '').slice(0, 1000),
              },
            ],
    };

    if (newStory.isFeaturedHero) {
      for (const s of state.stories) {
        if (s.language === newStory.language) {
          s.isFeaturedHero = false;
        }
      }
    }

    const existingIdx = state.stories.findIndex((s) => s.id === id);
    if (existingIdx >= 0) {
      state.stories[existingIdx] = newStory;
    } else {
      state.stories.unshift(newStory);
    }

    state.stories = sortStoriesNewestFirst(state.stories);
    saveState();
    void syncStoryToFirestoreRest(newStory, extractBearerToken(req));
    res.json({ stories: state.stories, categories: computeCategories() });
  });

  // Delete story (Drafts: Admin or manage_stories Editor; Published stories: Owner/Admin ONLY)
  app.delete('/api/admin/stories/:id', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasStaffPermission(user, 'manage_stories')) {
      res.status(403).json({ error: 'Permission required: manage_stories.' });
      return;
    }
    const storyId = (req.params.id || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(storyId)) {
      res.status(400).json({ error: 'Invalid story ID.' });
      return;
    }
    const targetStory = state.stories.find((s) => s.id === storyId);
    if (!targetStory) {
      res.status(404).json({ error: 'Story not found.' });
      return;
    }
    if (targetStory.publicationStatus === 'published' && user?.role !== 'admin') {
      res.status(403).json({
        error: 'Only Owner/Administrator can permanently delete published stories. Unpublish to draft first.',
      });
      return;
    }
    saveStateBackup(`pre-delete-${storyId}`);
    state.stories = state.stories.filter((s) => s.id !== storyId);
    saveState();
    void deleteStoryFromFirestoreRest(storyId, extractBearerToken(req));
    res.json({ stories: sortStoriesNewestFirst(state.stories), categories: computeCategories() });
  });

  // Update platform settings (OWNER / ADMIN ONLY)
  app.put('/api/admin/settings', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to change platform settings.' });
      return;
    }
    const nPassPrice = Number(req.body?.nPassMonthlyPriceInr);
    if (nPassPrice && nPassPrice > 0) {
      state.nPassMonthlyPriceInr = nPassPrice;
      saveState();
    }
    res.json({
      nPassMonthlyPriceInr: state.nPassMonthlyPriceInr || NPASS_MONTHLY_PRICE_INR,
      categories: computeCategories(),
    });
  });

  // Export full catalog state (OWNER / ADMIN ONLY)
  app.get('/api/admin/export', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to export data.' });
      return;
    }
    res.json({
      exportedAt: new Date().toISOString(),
      stories: state.stories,
      categories: computeCategories(),
      orders: state.orders,
      users: Object.values(state.users),
      editors: Object.values(state.editors || {}),
      nPassMonthlyPriceInr: state.nPassMonthlyPriceInr || NPASS_MONTHLY_PRICE_INR,
    });
  });

  // Import catalog state from backup (OWNER / ADMIN ONLY, validated non-empty + automatic pre-import backup)
  app.post('/api/admin/import', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to import catalog.' });
      return;
    }
    const importedStories = req.body?.stories;
    if (!Array.isArray(importedStories) || importedStories.length === 0) {
      res.status(400).json({ error: 'Import rejected: stories must be a non-empty array.' });
      return;
    }
    const allValid = importedStories.every(
      (s: unknown) =>
        Boolean(s) &&
        typeof s === 'object' &&
        typeof (s as StoryItem).id === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/.test((s as StoryItem).id) &&
        typeof (s as StoryItem).title === 'string' &&
        (s as StoryItem).title.trim().length > 0 &&
        ((s as StoryItem).language === 'bn' || (s as StoryItem).language === 'hi') &&
        Array.isArray((s as StoryItem).episodes),
    );
    if (!allValid) {
      res.status(400).json({
        error: 'Import rejected: one or more story entries failed schema validation.',
      });
      return;
    }

    saveStateBackup('pre-import');
    state.stories = sortStoriesNewestFirst(importedStories as StoryItem[]);
    saveState();
    res.json({
      stories: state.stories,
      categories: computeCategories(),
    });
  });

  // ---------------------------------------------------------------------------
  // WEB PUSH / FIREBASE CLOUD MESSAGING (FCM) ROUTES
  // ---------------------------------------------------------------------------
  app.post('/api/notifications/token', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required to register notification token.' });
      return;
    }

    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token.length < 10 || token.length > 512) {
      res.status(400).json({ error: 'Invalid FCM registration token.' });
      return;
    }

    const rawPlatform = req.body?.platform;
    const platform: 'web' | 'android' | 'ios' =
      rawPlatform === 'android' || rawPlatform === 'ios' ? rawPlatform : 'web';
    const language: Language = req.body?.language === 'hi' ? 'hi' : 'bn';
    const targetUid = (user.firebaseUid || user.id).trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(targetUid)) {
      res.status(400).json({ error: 'Invalid user identifier.' });
      return;
    }

    const saved = await fcmService.registerUserToken({
      uid: targetUid,
      token,
      platform,
      language,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    });

    res.json({
      ok: true,
      uid: targetUid,
      tokenId: saved.tokenId,
      firestoreSynced: saved.firestoreSynced,
    });
  });

  app.delete('/api/notifications/token', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token.length < 10 || token.length > 512) {
      res.status(400).json({ error: 'Invalid FCM registration token.' });
      return;
    }
    const targetUid = (user.firebaseUid || user.id).trim();
    await fcmService.unregisterUserToken(targetUid, token);
    res.json({ ok: true });
  });

  app.get('/api/admin/notifications/tokens', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required.' });
      return;
    }
    const tokens = await fcmService.listTokenSummaries();
    res.json({
      totalTokens: tokens.length,
      tokens,
    });
  });

  app.post('/api/admin/notifications/send', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to send push notifications.' });
      return;
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!title || !body) {
      res.status(400).json({ error: 'Both notification title and body are required.' });
      return;
    }

    try {
      const result = await fcmService.sendPushNotification({
        title,
        body,
        targetUid: typeof req.body?.targetUid === 'string' ? req.body.targetUid : undefined,
        targetEmail: typeof req.body?.targetEmail === 'string' ? req.body.targetEmail : undefined,
        targetToken: typeof req.body?.targetToken === 'string' ? req.body.targetToken : undefined,
        link: typeof req.body?.link === 'string' ? req.body.link : '/',
        imageUrl: typeof req.body?.imageUrl === 'string' ? req.body.imageUrl : undefined,
        storyId: typeof req.body?.storyId === 'string' ? req.body.storyId : undefined,
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send push notification.';
      res.status(502).json({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // SEO: ROBOTS.TXT & DYNAMIC SITEMAP.XML
  // ---------------------------------------------------------------------------
  const resolvePublicBaseUrl = (req: Request): string => {
    const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (envUrl) return envUrl;
    const protoHeader = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(protoHeader)
      ? protoHeader[0]
      : protoHeader?.split(',')[0]?.trim() || req.protocol || 'https';
    const host = req.get('host') || 'goppokahini.in';
    return `${proto}://${host}`;
  };

  const escapeXml = (str: string): string =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  app.get('/robots.txt', (req: Request, res: Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    res.type('text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (req: Request, res: Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const publishedStories = state.stories.filter(
      (s) => s.publicationStatus === 'published',
    );
    const today = new Date().toISOString().slice(0, 10);

    const urlEntries = [
      `  <url>\n    <loc>${escapeXml(`${baseUrl}/`)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
      ...SECTION_AND_INFO_SEO_SPECS.map(
        (spec) =>
          `  <url>\n    <loc>${escapeXml(`${baseUrl}${spec.path}`)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${spec.changefreq}</changefreq>\n    <priority>${spec.priority}</priority>\n  </url>`,
      ),
      ...publishedStories.map((story) => {
        const lastMod = (story.updatedAt || today).slice(0, 10);
        const storyUrl = `${baseUrl}${getStoryPath(story)}`;
        return `  <url>\n    <loc>${escapeXml(storyUrl)}</loc>\n    <lastmod>${escapeXml(lastMod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
      }),
      ...publishedStories.flatMap((story) => {
        const lastMod = (story.updatedAt || today).slice(0, 10);
        return (story.episodes || []).map((ep) => {
          const epUrl = `${baseUrl}${getEpisodePath(ep)}`;
          return `  <url>\n    <loc>${escapeXml(epUrl)}</loc>\n    <lastmod>${escapeXml(lastMod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
        });
      }),
    ];

    res.type('application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`,
    );
  });

  return { app, state, DATA_DIR, UPLOADS_DIR, IS_PRODUCTION, SANDBOX_PAYMENT_ALLOWED };
}

export async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  const { app } = createGoppoApp();

  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  const httpServer = http.createServer(app);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Goppo Kahini platform running at http://0.0.0.0:${PORT}`);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href &&
  process.env.GOPPO_NO_AUTOSTART !== 'true'
) {
  void startServer();
}
