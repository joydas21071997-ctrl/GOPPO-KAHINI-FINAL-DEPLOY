import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  isFirebaseConfigured,
  OperationType,
  testFirestoreConnection,
} from '../firebase';
import {
  DEFAULT_TICKET_PRICE_INR,
  MAX_LISTENS_PER_PURCHASE,
  type AdSettings,
  type CategoryConfig,
  type ContentCategory,
  type EditorGrant,
  type Language,
  type StoryItem,
} from '../types/content';
import { normalizeAdSettings } from '../utils/adConfig';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const EDITOR_PERMS = new Set([
  'manage_stories',
  'manage_media',
  'manage_hero',
  'translate_stories',
  'manage_categories',
]);

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `doc_${Date.now()}`;
}

export async function ensureBootstrappedAdminDoc(fbUser: User): Promise<boolean> {
  if (!isFirebaseConfigured || !db || !fbUser.emailVerified || !fbUser.email) {
    return false;
  }
  const path = `admins/${fbUser.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', fbUser.uid));
    if (snap.exists()) return true;
  } catch {
    // Non-admin read attempt ignored; fall through to verified create check
  }

  try {
    await setDoc(doc(db, 'admins', fbUser.uid), {
      uid: fbUser.uid,
      email: fbUser.email.slice(0, 254),
      role: 'admin',
      createdAt: serverTimestamp(),
    });
    return true;
  } catch {
    // Firestore rules reject non-bootstrapped accounts cleanly
    return false;
  }
}

export async function syncUserAccountToFirestore(
  fbUser: User,
  preferredLanguage: Language,
): Promise<void> {
  if (!isFirebaseConfigured || !db || !fbUser.uid || !VALID_ID_REGEX.test(fbUser.uid)) {
    return;
  }

  const userPath = `users/${fbUser.uid}`;
  const userRef = doc(db, 'users', fbUser.uid);
  const displayName = (
    fbUser.displayName ||
    (fbUser.email ? fbUser.email.split('@')[0] : '') ||
    'Goppo Kahini Listener'
  )
    .trim()
    .slice(0, 120);

  try {
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      const existingData = existing.data();
      await setDoc(userRef, {
        uid: fbUser.uid,
        name: displayName || existingData.name || 'Listener',
        preferredLanguage,
        createdAt: existingData.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        uid: fbUser.uid,
        name: displayName,
        preferredLanguage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  if (fbUser.email && fbUser.emailVerified) {
    const privatePath = `users/${fbUser.uid}/private/info`;
    try {
      await setDoc(doc(db, 'users', fbUser.uid, 'private', 'info'), {
        uid: fbUser.uid,
        email: fbUser.email.trim().toLowerCase().slice(0, 254),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}

export async function syncPlaybackProgressToFirestore(
  uid: string,
  payload: {
    storyId: string;
    episodeId: string;
    isTrailer: boolean;
    positionSeconds: number;
    durationSeconds: number;
  },
): Promise<void> {
  if (!isFirebaseConfigured || !db || !VALID_ID_REGEX.test(uid)) return;
  const progressId = sanitizeId(`${payload.storyId}_${payload.episodeId}`);
  const path = `users/${uid}/progress/${progressId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'progress', progressId), {
      storyId: sanitizeId(payload.storyId),
      episodeId: sanitizeId(payload.episodeId),
      isTrailer: Boolean(payload.isTrailer),
      positionSeconds: Math.min(86400, Math.max(0, Number(payload.positionSeconds) || 0)),
      durationSeconds: Math.min(86400, Math.max(1, Number(payload.durationSeconds) || 1)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function buildStoryFirestorePayload(story: StoryItem) {
  const storyId = sanitizeId(story.id);
  const payload: Record<string, unknown> = {
    id: storyId,
    language: story.language === 'hi' ? 'hi' : 'bn',
    category:
      story.category === 'animation' || story.category === 'films' ? story.category : 'audio',
    mediaType: story.mediaType === 'video' ? 'video' : 'audio',
    title: (story.title || 'Untitled').trim().slice(0, 200),
    subtitle: (story.subtitle || '').trim().slice(0, 300),
    synopsis: (story.synopsis || '').trim().slice(0, 3000),
    writer: (story.writer || 'Goppo Kahini Studio').trim().slice(0, 120),
    narrator: (story.narrator || 'Goppo Kahini Ensemble').trim().slice(0, 120),
    genre: (story.genre || 'Thriller').trim().slice(0, 100),
    coverArt: (story.coverArt || 'bn_cover_salbon').trim().slice(0, 500),
    heroArt: (story.heroArt || story.coverArt || 'bn_hero_zamindar').trim().slice(0, 500),
    trailerTitle: (story.trailerTitle || `Trailer — ${story.title}`).trim().slice(0, 220),
    trailerDurationLabel: (story.trailerDurationLabel || '00:45').trim().slice(0, 20),
    trailerDurationSeconds: Math.min(
      36000,
      Math.max(0, Number(story.trailerDurationSeconds) || 40),
    ),
    trailerAudioKey: (story.trailerAudioKey || `${storyId}_trailer`).trim().slice(0, 140),
    totalDurationLabel: (story.totalDurationLabel || '20m').trim().slice(0, 30),
    ticketPriceInr: Math.min(50000, Math.max(0, Number(story.ticketPriceInr) || 0)),
    accessPolicy:
      story.accessPolicy === 'ticket_only' || story.accessPolicy === 'npass_included'
        ? story.accessPolicy
        : 'both',
    publicationStatus: story.publicationStatus === 'draft' ? 'draft' : 'published',
    isFeaturedHero: Boolean(story.isFeaturedHero),
    releaseYear: Math.min(2100, Math.max(1900, Number(story.releaseYear) || 2026)),
    collections: Array.isArray(story.collections) ? story.collections.slice(0, 10) : ['new'],
    episodes: (Array.isArray(story.episodes) ? story.episodes : []).slice(0, 100).map((ep, idx) => ({
      id: ep.id || `${storyId}-ep-${idx + 1}`,
      number: ep.number || idx + 1,
      title: (ep.title || `Episode ${idx + 1}`).slice(0, 200),
      durationLabel: (ep.durationLabel || '14:00').slice(0, 20),
      durationSeconds: Number(ep.durationSeconds) || 75,
      audioKey: (ep.audioKey || `${storyId}_ep_${idx + 1}`).slice(0, 140),
      synopsis: (ep.synopsis || '').slice(0, 1000),
      mediaType: ep.mediaType === 'video' ? 'video' : 'audio',
      ...(ep.audioUrl ? { audioUrl: ep.audioUrl.slice(0, 1000) } : {}),
      ...(ep.videoUrl ? { videoUrl: ep.videoUrl.slice(0, 1000) } : {}),
    })),
    updatedAt: serverTimestamp(),
  };

  if (story.trailerAudioUrl) {
    payload.trailerAudioUrl = story.trailerAudioUrl.slice(0, 1000);
  }
  if (story.trailerVideoUrl) {
    payload.trailerVideoUrl = story.trailerVideoUrl.slice(0, 1000);
  }
  return payload;
}

export async function syncStoryToFirestore(story: StoryItem): Promise<void> {
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return;
  const storyId = sanitizeId(story.id);
  const path = `stories/${storyId}`;
  try {
    await setDoc(doc(db, 'stories', storyId), buildStoryFirestorePayload(story));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteStoryFromFirestore(storyId: string): Promise<void> {
  if (!isFirebaseConfigured || !db || !auth?.currentUser || !VALID_ID_REGEX.test(storyId)) return;
  const path = `stories/${storyId}`;
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncCategoryToFirestore(
  categoryId: ContentCategory,
  enabledByAdmin: boolean,
): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!isFirebaseConfigured || !db || !uid) return;
  const path = `categories/${categoryId}`;
  try {
    await setDoc(doc(db, 'categories', categoryId), {
      id: categoryId,
      enabledByAdmin: Boolean(enabledByAdmin),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncEditorToFirestore(grant: EditorGrant): Promise<void> {
  const actorUid = auth?.currentUser?.uid;
  if (!isFirebaseConfigured || !db || !actorUid || !grant.uid || !VALID_ID_REGEX.test(grant.uid)) {
    return;
  }
  const perms = grant.permissions.filter((p) => EDITOR_PERMS.has(p));
  if (perms.length === 0) return;

  const path = `editors/${grant.uid}`;
  try {
    await setDoc(doc(db, 'editors', grant.uid), {
      uid: grant.uid,
      email: grant.email.trim().toLowerCase().slice(0, 254),
      name: (grant.name || grant.email.split('@')[0]).trim().slice(0, 120),
      role: 'editor',
      permissions: perms,
      grantedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteEditorFromFirestore(editorUid: string): Promise<void> {
  if (!isFirebaseConfigured || !db || !auth?.currentUser || !VALID_ID_REGEX.test(editorUid)) return;
  const path = `editors/${editorUid}`;
  try {
    await deleteDoc(doc(db, 'editors', editorUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncPlatformSettingToFirestore(
  nPassMonthlyPriceInr: number,
): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!isFirebaseConfigured || !db || !uid) return;
  const path = 'settings/platform';
  try {
    await setDoc(doc(db, 'settings', 'platform'), {
      key: 'platform',
      nPassMonthlyPriceInr: Math.max(1, Number(nPassMonthlyPriceInr) || DEFAULT_TICKET_PRICE_INR),
      defaultTicketPriceInr: DEFAULT_TICKET_PRICE_INR,
      maxListensPerPurchase: MAX_LISTENS_PER_PURCHASE,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncFullCatalogToFirestore(
  stories: StoryItem[],
  categories: CategoryConfig[],
  nPassPriceInr: number,
): Promise<{ syncedStories: number; syncedCategories: number }> {
  if (!isFirebaseConfigured || !db || !auth?.currentUser) {
    throw new Error('Firebase প্রমাণীকরণ সক্রিয় নয়।');
  }

  let syncedStories = 0;
  for (let i = 0; i < stories.length; i += 8) {
    const chunk = stories.slice(i, i + 8);
    await Promise.all(chunk.map((s) => syncStoryToFirestore(s)));
    syncedStories += chunk.length;
  }

  let syncedCategories = 0;
  for (const cat of categories) {
    await syncCategoryToFirestore(cat.id, cat.enabledByAdmin);
    syncedCategories += 1;
  }

  await syncPlatformSettingToFirestore(nPassPriceInr);
  return { syncedStories, syncedCategories };
}

export async function fetchFirestoreDiagnostics(): Promise<{
  connected: boolean;
  message: string;
  storiesCount: number;
  categoriesCount: number;
  adminDocPresent: boolean;
}> {
  const conn = await testFirestoreConnection();
  if (!isFirebaseConfigured || !db) {
    return {
      ...conn,
      storiesCount: 0,
      categoriesCount: 0,
      adminDocPresent: false,
    };
  }

  let storiesCount = 0;
  let categoriesCount = 0;
  let adminDocPresent = false;

  try {
    const storiesSnap = await getDocs(collection(db, 'stories'));
    storiesCount = storiesSnap.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'stories');
  }

  try {
    const catsSnap = await getDocs(collection(db, 'categories'));
    categoriesCount = catsSnap.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'categories');
  }

  if (auth?.currentUser?.uid) {
    try {
      const adminSnap = await getDoc(doc(db, 'admins', auth.currentUser.uid));
      adminDocPresent = adminSnap.exists();
    } catch {
      adminDocPresent = false;
    }
  }

  return {
    connected: conn.connected,
    message: conn.message,
    storiesCount,
    categoriesCount,
    adminDocPresent,
  };
}

function buildAdFirestorePayload(
  raw: AdSettings,
  status: 'draft' | 'published',
  actorUid: string,
  version: number,
  publishedAt?: string,
) {
  const norm = normalizeAdSettings(raw, status);
  return {
    enabled: norm.enabled,
    version,
    status,
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
    ...(publishedAt ? { publishedAt } : norm.publishedAt ? { publishedAt: norm.publishedAt } : {}),
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  };
}

export async function saveAdDraftToFirestore(settings: AdSettings): Promise<AdSettings> {
  const uid = auth?.currentUser?.uid;
  const nowIso = new Date().toISOString();
  const nextDraft = normalizeAdSettings({ ...settings, status: 'draft', updatedAt: nowIso }, 'draft');
  if (!isFirebaseConfigured || !db || !uid) {
    return nextDraft;
  }
  const path = 'ad_settings/draft';
  try {
    await setDoc(
      doc(db, 'ad_settings', 'draft'),
      buildAdFirestorePayload(nextDraft, 'draft', uid, Math.max(1, nextDraft.version || 1)),
    );
    return nextDraft;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function publishAdSettingsToFirestore(settings: AdSettings): Promise<AdSettings> {
  const uid = auth?.currentUser?.uid;
  const nowIso = new Date().toISOString();
  const nextVersion = Math.max(1, (settings.version || 0) + 1);
  const nextPublished = normalizeAdSettings(
    {
      ...settings,
      status: 'published',
      version: nextVersion,
      publishedAt: nowIso,
      updatedAt: nowIso,
      updatedBy: uid || settings.updatedBy,
    },
    'published',
  );
  if (!isFirebaseConfigured || !db || !uid) {
    return nextPublished;
  }

  try {
    // 1. Update Published document (live source for website & PWA)
    await setDoc(
      doc(db, 'ad_settings', 'published'),
      buildAdFirestorePayload(nextPublished, 'published', uid, nextVersion, nowIso),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'ad_settings/published');
  }

  try {
    // 2. Sync Draft document to match the newly published snapshot
    await setDoc(
      doc(db, 'ad_settings', 'draft'),
      buildAdFirestorePayload(nextPublished, 'draft', uid, nextVersion, nowIso),
    );
  } catch {
    // Non-blocking if draft doc update fails after published succeeds
  }

  return nextPublished;
}

export async function fetchPublishedAdsFromFirestore(): Promise<AdSettings | null> {
  if (!isFirebaseConfigured || !db) return null;
  try {
    // Always fetch directly from server so PWA/browser SW cache never serves stale ad settings
    const snap = await getDocFromServer(doc(db, 'ad_settings', 'published'));
    if (snap.exists()) {
      return normalizeAdSettings(snap.data(), 'published');
    }
    return null;
  } catch {
    try {
      const snap = await getDoc(doc(db, 'ad_settings', 'published'));
      if (snap.exists()) {
        return normalizeAdSettings(snap.data(), 'published');
      }
    } catch {
      // Offline / unseeded fallback
    }
    return null;
  }
}

export async function fetchDraftAdsFromFirestore(): Promise<AdSettings | null> {
  if (!isFirebaseConfigured || !db || !auth?.currentUser) return null;
  try {
    const snap = await getDocFromServer(doc(db, 'ad_settings', 'draft'));
    if (snap.exists()) {
      return normalizeAdSettings(snap.data(), 'draft');
    }
    return null;
  } catch {
    return null;
  }
}

