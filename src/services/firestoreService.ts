import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
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
  type AdminPermission,
  type AdSettings,
  type CategoryConfig,
  type ContentCategory,
  type EditorGrant,
  type Language,
  type OrderRecord,
  type PlaybackProgress,
  type StoryItem,
  type StoryTicketEntitlement,
  type UserProfile,
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
  if (
    !isFirebaseConfigured ||
    !db ||
    !fbUser.uid ||
    !VALID_ID_REGEX.test(fbUser.uid) ||
    !fbUser.emailVerified
  ) {
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

const ALL_CLIENT_ADMIN_PERMISSIONS: AdminPermission[] = [
  'manage_stories',
  'manage_media',
  'manage_hero',
  'translate_stories',
  'manage_categories',
  'manage_settings',
  'manage_users_orders',
  'manage_editors',
  'export_import_catalog',
];

export async function hydrateClientUserFromFirestore(
  fbUser: User,
  preferredLangOverride?: Language,
): Promise<{
  user: UserProfile;
  orders: OrderRecord[];
  progress: PlaybackProgress[];
}> {
  const emailLower = (fbUser.email || '').trim().toLowerCase();
  let role: UserProfile['role'] = 'listener';
  let permissions: AdminPermission[] | undefined = undefined;
  let storedName = fbUser.displayName || (emailLower ? emailLower.split('@')[0] : '') || 'Listener';
  let preferredLanguage: Language = preferredLangOverride || 'bn';

  if (db && VALID_ID_REGEX.test(fbUser.uid)) {
    const isVerifiedBootstrappedOwner =
      fbUser.emailVerified && emailLower === 'joydas.21071997@gmail.com';

    let isAdmin = isVerifiedBootstrappedOwner;
    if (!isAdmin && fbUser.emailVerified) {
      try {
        const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
        isAdmin = adminSnap.exists();
      } catch {
        // Not an admin
      }
    }

    if (isAdmin) {
      role = 'admin';
      permissions = [...ALL_CLIENT_ADMIN_PERMISSIONS];
    } else if (fbUser.emailVerified) {
      try {
        const editorSnap = await getDoc(doc(db, 'editors', fbUser.uid));
        if (editorSnap.exists()) {
          const rawPerms = editorSnap.data()?.permissions;
          const validPerms = Array.isArray(rawPerms)
            ? (rawPerms.filter((p): p is AdminPermission => typeof p === 'string' && EDITOR_PERMS.has(p)))
            : [];
          if (validPerms.length > 0) {
            role = 'editor';
            permissions = validPerms;
          }
        }
      } catch {
        // Not an editor
      }
    }

    try {
      const userSnap = await getDoc(doc(db, 'users', fbUser.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (typeof data.name === 'string' && data.name.trim()) {
          storedName = data.name.trim();
        }
        if (!preferredLangOverride && (data.preferredLanguage === 'hi' || data.preferredLanguage === 'bn')) {
          preferredLanguage = data.preferredLanguage;
        }
      }
    } catch {
      // Unverified email user or newly registered user without /users/{uid} doc yet
    }
  }

  const storyEntitlements: Record<string, StoryTicketEntitlement> = {};
  const purchasedStoryIds: string[] = [];
  const orders: OrderRecord[] = [];
  const progress: PlaybackProgress[] = [];

  if (db && VALID_ID_REGEX.test(fbUser.uid)) {
    try {
      const entSnap = await getDocs(collection(db, 'users', fbUser.uid, 'entitlements'));
      entSnap.forEach((docSnap) => {
        const ent = docSnap.data() as Partial<StoryTicketEntitlement>;
        const sid = ent.storyId || docSnap.id;
        if (sid) {
          storyEntitlements[sid] = {
            storyId: sid,
            remainingListens: Number(ent.remainingListens) || 0,
            totalListensUsed: Number(ent.totalListensUsed) || 0,
            completedEpisodeIdsInCycle: Array.isArray(ent.completedEpisodeIdsInCycle)
              ? ent.completedEpisodeIdsInCycle
              : [],
            lastOrderId: ent.lastOrderId,
            updatedAt: typeof ent.updatedAt === 'string' ? ent.updatedAt : new Date().toISOString(),
          };
          if ((Number(ent.remainingListens) || 0) > 0 && !purchasedStoryIds.includes(sid)) {
            purchasedStoryIds.push(sid);
          }
        }
      });
    } catch {
      // Non-blocking fallback
    }

    try {
      const progSnap = await getDocs(collection(db, 'users', fbUser.uid, 'progress'));
      progSnap.forEach((docSnap) => {
        const p = docSnap.data() as Partial<PlaybackProgress>;
        if (p.storyId && p.episodeId) {
          progress.push({
            storyId: p.storyId,
            episodeId: p.episodeId,
            isTrailer: Boolean(p.isTrailer),
            positionSeconds: Number(p.positionSeconds) || 0,
            durationSeconds: Number(p.durationSeconds) || 1,
            updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
          });
        }
      });
    } catch {
      // Non-blocking fallback
    }

    try {
      const ordersSnap = await getDocs(
        query(collection(db, 'orders'), where('userId', '==', fbUser.uid)),
      );
      ordersSnap.forEach((docSnap) => {
        const ord = docSnap.data() as OrderRecord;
        if (ord && ord.orderId) {
          orders.push(ord);
        }
      });
      orders.sort((a, b) => Date.parse(b.createdAt || '0') - Date.parse(a.createdAt || '0'));
    } catch {
      // Non-blocking fallback
    }
  }

  return {
    user: {
      id: fbUser.uid,
      firebaseUid: fbUser.uid,
      name: storedName,
      email: fbUser.email || '',
      role,
      permissions,
      preferredLanguage,
      purchasedStoryIds,
      storyEntitlements,
      membership: {
        planId: 'npass_monthly_9',
        priceInr: DEFAULT_TICKET_PRICE_INR,
        status: 'INACTIVE',
      },
    },
    orders,
    progress,
  };
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function formatFirebaseAuthError(
  error: unknown,
  language: Language = 'bn',
): { code: string; message: string; isCancelled?: boolean } {
  const errObj = error as { code?: string; message?: string } | null;
  const rawCode = typeof errObj?.code === 'string' ? errObj.code : '';
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const combined = `${rawCode} ${rawMessage}`.toLowerCase();

  if (
    combined.includes('popup-closed-by-user') ||
    combined.includes('cancelled-popup-request')
  ) {
    return { code: rawCode || 'auth/popup-closed-by-user', message: '', isCancelled: true };
  }
  if (combined.includes('popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      message:
        language === 'bn'
          ? 'ব্রাউজার সাইন-ইন পপ-আপ ব্লক করেছে। অনুগ্রহ করে এই সাইটের জন্য পপ-আপ অনুমতি দিন অথবা নতুন ট্যাবে খুলে চেষ্টা করুন।'
          : 'ब्राउज़र ने साइन-इन पॉप-अप ब्लॉक किया है। कृपया पॉप-अप की अनुमति दें या नए टैब में खोलकर प्रयास करें।',
    };
  }
  if (combined.includes('unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      message:
        language === 'bn'
          ? 'এই ডোমেইনটি Firebase Authentication-এ Authorized Domain হিসেবে যুক্ত নয়। Firebase Console > Authentication > Settings > Authorized domains থেকে বর্তমান ডোমেইন যুক্ত করুন।'
          : 'यह डोमेन Firebase Authentication में Authorized Domain के रूप में जुड़ा नहीं है। कृपया Firebase Console से डोमेन जोड़ें।',
    };
  }
  if (combined.includes('operation-not-allowed')) {
    return {
      code: 'auth/operation-not-allowed',
      message:
        language === 'bn'
          ? 'Firebase Console-এ এই সাইন-ইন পদ্ধতি (Google বা Email/Password) এখনো চালু করা হয়নি। অনুগ্রহ করে Firebase Console > Authentication > Sign-in method থেকে প্রোভাইডার Enable করুন।'
          : 'Firebase Console में यह साइन-इन विधि (Google या Email/Password) सक्षम नहीं है। कृपया Firebase Console में Sign-in method चालू करें।',
    };
  }
  if (combined.includes('email-already-in-use')) {
    return {
      code: 'auth/email-already-in-use',
      message:
        language === 'bn'
          ? 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট তৈরি করা আছে। অনুগ্রহ করে "লগইন" ট্যাব থেকে সাইন ইন করুন বা Google সাইন-ইন ব্যবহার করুন।'
          : 'इस ईमेल से पहले ही अकाउंट बना हुआ है। कृपया "लॉगिन" टैब से साइन इन करें या Google साइन-इन उपयोग करें।',
    };
  }
  if (
    combined.includes('invalid-credential') ||
    combined.includes('wrong-password') ||
    combined.includes('user-not-found')
  ) {
    return {
      code: rawCode || 'auth/invalid-credential',
      message:
        language === 'bn'
          ? 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। আগে Google দিয়ে সাইন ইন করে থাকলে Google বাটন ব্যবহার করুন অথবা পাসওয়ার্ড রিসেট করুন।'
          : 'ईमेल या पासवर्ड गलत है। यदि आपने पहले Google से साइन इन किया था, तो Google बटन का उपयोग करें या पासवर्ड रीसेट करें।',
    };
  }
  if (combined.includes('account-exists-with-different-credential')) {
    return {
      code: 'auth/account-exists-with-different-credential',
      message:
        language === 'bn'
          ? 'এই ইমেইলটি অন্য সাইন-ইন পদ্ধতির সাথে যুক্ত। আপনার মূল সাইন-ইন পদ্ধতি (Google বা ইমেইল/পাসওয়ার্ড) দিয়ে প্রবেশ করুন।'
          : 'यह ईमेल किसी अन्य साइन-इन विधि से जुड़ा है। कृपया अपनी मूल विधि से लॉगिन करें।',
    };
  }
  if (combined.includes('weak-password')) {
    return {
      code: 'auth/weak-password',
      message:
        language === 'bn'
          ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'
          : 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।',
    };
  }
  if (combined.includes('invalid-email')) {
    return {
      code: 'auth/invalid-email',
      message:
        language === 'bn'
          ? 'অনুগ্রহ করে একটি সঠিক ইমেইল ঠিকানা লিখুন।'
          : 'कृपया एक वैध ईमेल पता दर्ज करें।',
    };
  }
  if (combined.includes('too-many-requests')) {
    return {
      code: 'auth/too-many-requests',
      message:
        language === 'bn'
          ? 'অনেকবার চেষ্টা করার কারণে সাময়িকভাবে ব্লক করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : 'बहुत अधिक प्रयासों के कारण अस्थायी रूप से रोका गया है। कृपया कुछ देर बाद पुनः प्रयास करें।',
    };
  }
  if (combined.includes('user-disabled')) {
    return {
      code: 'auth/user-disabled',
      message:
        language === 'bn'
          ? 'এই অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। সহায়তার জন্য যোগাযোগ করুন।'
          : 'यह अकाउंट अक्षम कर दिया गया है। कृपया सहायता के लिए संपर्क करें।',
    };
  }
  if (combined.includes('network-request-failed')) {
    return {
      code: 'auth/network-request-failed',
      message:
        language === 'bn'
          ? 'ইন্টারনেট সংযোগ অথবা Firebase অথেন্টিকেশন সার্ভারে পৌঁছানো যাচ্ছে না। নেটওয়ার্ক যাচাই করে আবার চেষ্টা করুন।'
          : 'इंटरनेट कनेक्शन या Firebase सर्वर से संपर्क नहीं हो पा रहा है। कृपया नेटवर्क जांचकर पुनः प्रयास करें।',
    };
  }
  return {
    code: rawCode || 'auth/unknown',
    message:
      language === 'bn'
        ? 'সাইন-ইন সম্পন্ন করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
        : 'साइन-इन पूर्ण नहीं हो सका। कृपया पुनः प्रयास करें।',
  };
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

export async function computeFcmTokenDocId(token: string): Promise<string> {
  const normalized = token.trim();
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const digest = await window.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(normalized),
      );
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `fcm_${hex.slice(0, 40)}`;
    } catch {
      // Fallback hash below
    }
  }
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fcm_${(hash >>> 0).toString(16)}_${normalized.length}`;
}

export async function saveFcmTokenToFirestore(
  uid: string,
  token: string,
  language: Language = 'bn',
): Promise<string | null> {
  const cleanToken = (token || '').trim();
  if (
    !isFirebaseConfigured ||
    !db ||
    !auth?.currentUser ||
    auth.currentUser.uid !== uid ||
    !auth.currentUser.emailVerified ||
    !VALID_ID_REGEX.test(uid) ||
    cleanToken.length < 10 ||
    cleanToken.length > 512
  ) {
    return null;
  }

  const tokenId = await computeFcmTokenDocId(cleanToken);
  const tokenRef = doc(db, 'users', uid, 'fcmTokens', tokenId);
  const path = `users/${uid}/fcmTokens/${tokenId}`;
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '').slice(0, 300) : '';

  try {
    const existing = await getDoc(tokenRef).catch(() => null);
    const createdAtValue =
      existing && existing.exists() && existing.data()?.createdAt
        ? existing.data().createdAt
        : serverTimestamp();

    await setDoc(tokenRef, {
      uid,
      token: cleanToken,
      platform: 'web',
      language: language === 'hi' ? 'hi' : 'bn',
      ...(ua ? { userAgent: ua } : {}),
      createdAt: createdAtValue,
      updatedAt: serverTimestamp(),
    });
    return tokenId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFcmTokenFromFirestore(uid: string, token: string): Promise<void> {
  const cleanToken = (token || '').trim();
  if (!isFirebaseConfigured || !db || !auth?.currentUser || !VALID_ID_REGEX.test(uid) || !cleanToken) {
    return;
  }
  const tokenId = await computeFcmTokenDocId(cleanToken);
  const path = `users/${uid}/fcmTokens/${tokenId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'fcmTokens', tokenId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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
  const fbUser = auth?.currentUser;
  const uid = fbUser?.uid;
  const nowIso = new Date().toISOString();
  const nextDraft = normalizeAdSettings({ ...settings, status: 'draft', updatedAt: nowIso }, 'draft');
  if (!isFirebaseConfigured || !db || !fbUser || !uid) {
    throw new Error('Firebase অ্যাডমিন সেশন পাওয়া যায়নি। অনুগ্রহ করে পুনরায় Google দিয়ে লগইন করুন।');
  }
  await ensureBootstrappedAdminDoc(fbUser).catch(() => {});
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
  const fbUser = auth?.currentUser;
  const uid = fbUser?.uid;
  if (!isFirebaseConfigured || !db || !fbUser || !uid) {
    throw new Error('Firebase অ্যাডমিন সেশন পাওয়া যায়নি। লাইভ সাইট ও PWA-তে প্রকাশ করতে অনুগ্রহ করে Google দিয়ে লগইন করুন।');
  }
  await ensureBootstrappedAdminDoc(fbUser).catch(() => {});

  const nowIso = new Date().toISOString();
  const nextVersion = Math.max(1, (settings.version || 0) + 1);
  const nextPublished = normalizeAdSettings(
    {
      ...settings,
      status: 'published',
      version: nextVersion,
      publishedAt: nowIso,
      updatedAt: nowIso,
      updatedBy: uid,
    },
    'published',
  );

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

