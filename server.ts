import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
  deleteEditorFromFirestoreRest,
  deleteStoryFromFirestoreRest,
  hydrateCatalogFromFirestoreIfAvailable,
  syncCategoryToFirestoreRest,
  syncEditorToFirestoreRest,
  syncEntitlementToFirestoreRest,
  syncOrderToFirestoreRest,
  syncStoryToFirestoreRest,
} from './server/firestoreSync.ts';
import type {
  AccessPolicy,
  AdminPermission,
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

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const LIVE_GATEWAY_CONNECTED =
  process.env.PAYMENT_GATEWAY_ENABLED === 'true' &&
  Boolean(process.env.PAYMENT_GATEWAY_KEY_ID) &&
  Boolean(process.env.PAYMENT_GATEWAY_KEY_SECRET);

interface PersistedState {
  stories: StoryItem[];
  categoryToggles: Record<ContentCategory, boolean>;
  users: Record<string, UserProfile>;
  editors?: Record<string, EditorGrant>; // keyed by lowercase email
  sessions: Record<string, string>; // opaque listener tokens only: token -> userId
  orders: OrderRecord[];
  progressByUser: Record<string, PlaybackProgress[]>;
  nPassMonthlyPriceInr?: number;
  pricingMigratedTo9?: boolean;
}

const DATA_DIR = path.resolve(process.cwd(), '.goppo-data');
const STATE_FILE = path.join(DATA_DIR, 'platform-state-v2.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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
        return parsed;
      }
    }
  } catch {
    // Fall back safely to clean seed state if local cache is unreadable
  }
  const fresh = createDefaultState();
  fresh.pricingMigratedTo9 = true;
  return fresh;
}

const state: PersistedState = loadState();
const audioBufferCache = new Map<string, Buffer>();

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
  if (typeof req.query.token === 'string') {
    return req.query.token.trim();
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
  const firestoreAdminDoc = await checkFirestoreRoleDoc(token, 'admins', verified.uid);
  const isOwnerByExistingRecord =
    verified.emailVerified && existing?.role === 'admin';

  if (isOwnerByEnv || firestoreAdminDoc !== null || isOwnerByExistingRecord) {
    resolvedRole = 'admin';
    resolvedPermissions = [...ALL_ADMIN_PERMISSIONS];
  } else if (verified.emailVerified) {
    // Check Editor grants (Firestore /editors/{uid} or server-stored state.editors)
    const firestoreEditorDoc = await checkFirestoreRoleDoc(token, 'editors', verified.uid);
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
    const verified = await verifyFirebaseIdToken(token);
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

async function startServer() {
  saveState();
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
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

    const payload: BootstrapPayload = {
      stories: visibleStories,
      categories: computeCategories(),
      nPassMonthlyPriceInr: state.nPassMonthlyPriceInr || NPASS_MONTHLY_PRICE_INR,
      liveGatewayConnected: LIVE_GATEWAY_CONNECTED,
      user,
      orders: user ? state.orders.filter((o) => o.userId === user.id) : [],
      progress: user ? state.progressByUser[user.id] || [] : [],
    };
    res.json(payload);
  });

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

    const verified = await verifyFirebaseIdToken(idToken);
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

    if (isStaffAccount) {
      res.status(403).json({
        error: 'Administrator and Editor accounts must sign in securely via Firebase Authentication.',
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
    res.json({ order, liveGatewayConnected: LIVE_GATEWAY_CONNECTED });
  });

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

    if (!LIVE_GATEWAY_CONNECTED) {
      order.status = 'FAILED';
      order.failureReason = 'LIVE_GATEWAY_NOT_AUTHORIZED';
      saveState();
      res.status(503).json({
        verified: false,
        reason: 'LIVE_GATEWAY_NOT_AUTHORIZED',
        order,
        orders: state.orders.filter((o) => o.userId === user.id),
      });
      return;
    }

    order.status = 'FAILED';
    order.failureReason = 'MISSING_GATEWAY_SIGNATURE';
    saveState();
    res.status(400).json({
      verified: false,
      reason: 'MISSING_GATEWAY_SIGNATURE',
      order,
      orders: state.orders.filter((o) => o.userId === user.id),
    });
  });

  app.post('/api/orders/:orderId/sandbox-verify', async (req: Request, res: Response) => {
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

    order.status = 'VERIFIED';
    order.failureReason = undefined;
    order.isSandboxVerification = true;
    order.verifiedAt = new Date().toISOString();

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
        isSandboxVerification: true,
      };
    }

    saveState();
    void syncOrderToFirestoreRest(order);
    if (order.itemType === 'story_ticket' && order.storyId && user.storyEntitlements?.[order.storyId]) {
      void syncEntitlementToFirestoreRest(user, user.storyEntitlements[order.storyId]);
    }
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
      const user = await resolveAuthenticatedUser(req);
      const isAuthorizedStaff =
        user?.role === 'admin' || hasStaffPermission(user, 'manage_stories');
      if (!isAuthorizedStaff && !userHasStoryAccess(user, story)) {
        res.status(403).json({
          error: 'Verified ticket or eligible active membership is required to stream this episode.',
        });
        return;
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

  // Upload custom audio, video, or image files (Requires manage_media)
  app.post('/api/admin/upload-media', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasStaffPermission(user, 'manage_media')) {
      res.status(403).json({ error: 'Permission required: manage_media.' });
      return;
    }
    const { fileData, fileName, mediaType } = req.body || {};
    if (!fileData || typeof fileData !== 'string') {
      res.status(400).json({ error: 'File data is required.' });
      return;
    }
    try {
      let buffer: Buffer;
      let ext = mediaType === 'video' ? 'mp4' : mediaType === 'image' ? 'jpg' : 'mp3';
      if (fileData.startsWith('data:')) {
        const matches = fileData.match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);
        if (matches && matches[2]) {
          const mime = matches[1].toLowerCase();
          if (mime.includes('wav')) ext = 'wav';
          else if (mime.includes('webm')) ext = 'webm';
          else if (mime.includes('ogg')) ext = 'ogg';
          else if (mime.includes('mp4') || mime.includes('m4a')) ext = mime.startsWith('video/') || mediaType === 'video' ? 'mp4' : 'm4a';
          else if (mime.includes('mov') || mime.includes('quicktime')) ext = 'mov';
          else if (mime.includes('mkv') || mime.includes('matroska')) ext = 'mkv';
          else if (mime.includes('png')) ext = 'png';
          else if (mime.includes('webp')) ext = 'webp';
          else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(fileData, 'base64');
        }
      } else {
        buffer = Buffer.from(fileData, 'base64');
      }

      const originalBase = fileName ? path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9_-]/g, '_') : 'upload';
      const safeName = `${originalBase}_${Date.now()}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(filePath, buffer);

      const publicUrl = `/api/uploads/${safeName}`;
      res.json({
        url: publicUrl,
        fileName: safeName,
        sizeBytes: buffer.length,
        mediaType: ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'mkv' ? 'video' : ext === 'jpg' || ext === 'png' || ext === 'webp' ? 'image' : 'audio',
      });
    } catch {
      res.status(500).json({ error: 'Failed to process and store media file.' });
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

  // Serve stored uploads directly
  app.get('/api/uploads/:fileName', (req: Request, res: Response) => {
    const fileName = path.basename(req.params.fileName);
    const targetPath = path.join(UPLOADS_DIR, fileName);
    if (!fs.existsSync(targetPath)) {
      res.status(404).send('Uploaded file not found.');
      return;
    }
    res.sendFile(targetPath);
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

    const id =
      body.id && typeof body.id === 'string'
        ? body.id
        : `${body.language}-${crypto.randomBytes(4).toString('hex')}`;

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

    const newStory: StoryItem = {
      id,
      language: body.language === 'hi' ? 'hi' : 'bn',
      category:
        body.category === 'animation' || body.category === 'films'
          ? body.category
          : 'audio',
      collections: ['new'],
      isFeaturedHero: desiredHero,
      updatedAt: nowIso,
      title: body.title.trim(),
      subtitle: body.subtitle?.trim() || '',
      synopsis: body.synopsis?.trim() || '',
      writer: body.writer?.trim() || 'Goppo Kahini Studio',
      narrator: body.narrator?.trim() || 'Goppo Kahini Ensemble',
      genre: body.genre.trim(),
      coverArt: body.coverArt?.trim() || (body.language === 'hi' ? 'hi_cover_haveli' : 'bn_cover_salbon'),
      heroArt: body.heroArt?.trim() || body.coverArt?.trim() || (body.language === 'hi' ? 'hi_hero_ghat' : 'bn_hero_zamindar'),
      mediaType:
        body.mediaType ||
        (body.category === 'animation' || body.category === 'films' ? 'video' : 'audio'),
      trailerTitle: body.trailerTitle?.trim() || `Trailer — ${body.title.trim()}`,
      trailerDurationLabel: body.trailerDurationLabel || '00:45',
      trailerDurationSeconds: body.trailerDurationSeconds || 40,
      trailerAudioKey: `${id}_trailer`,
      trailerAudioUrl: body.trailerAudioUrl?.trim() || undefined,
      trailerVideoUrl: body.trailerVideoUrl?.trim() || undefined,
      totalDurationLabel: body.totalDurationLabel || '20m',
      ticketPriceInr:
        body.ticketPriceInr === 0
          ? 0
          : Math.max(1, Number(body.ticketPriceInr) || DEFAULT_TICKET_PRICE_INR),
      accessPolicy,
      publicationStatus: body.publicationStatus === 'draft' ? 'draft' : 'published',
      releaseYear: 2026,
      episodes:
        Array.isArray(body.episodes) && body.episodes.length > 0
          ? body.episodes.map((ep, index) => ({
              id: ep.id || `${id}-ep-${index + 1}`,
              number: index + 1,
              title: ep.title || `Episode ${index + 1}`,
              durationLabel: ep.durationLabel || '14:00',
              durationSeconds: ep.durationSeconds || 75,
              audioKey: ep.audioKey || `${id}_ep_${index + 1}`,
              audioUrl: ep.audioUrl?.trim() || undefined,
              videoUrl: ep.videoUrl?.trim() || undefined,
              mediaType:
                ep.mediaType ||
                (body.category === 'animation' || body.category === 'films' ? 'video' : 'audio'),
              synopsis: ep.synopsis || '',
            }))
          : [
              {
                id: `${id}-ep-1`,
                number: 1,
                title: body.language === 'hi' ? 'अध्याय 1' : 'পর্ব ১',
                durationLabel: '15:00',
                durationSeconds: 75,
                audioKey: `${id}_ep_1`,
                synopsis: body.synopsis?.trim() || '',
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

  // Delete story (Requires manage_stories)
  app.delete('/api/admin/stories/:id', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!hasStaffPermission(user, 'manage_stories')) {
      res.status(403).json({ error: 'Permission required: manage_stories.' });
      return;
    }
    const storyId = req.params.id;
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

  // Import catalog state from backup (OWNER / ADMIN ONLY)
  app.post('/api/admin/import', async (req: Request, res: Response) => {
    const user = await resolveAuthenticatedUser(req);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ error: 'Owner/Administrator role required to import catalog.' });
      return;
    }
    const importedStories = req.body?.stories;
    if (Array.isArray(importedStories)) {
      state.stories = sortStoriesNewestFirst(importedStories);
      saveState();
    }
    res.json({
      stories: state.stories,
      categories: computeCategories(),
    });
  });

  // ---------------------------------------------------------------------------
  // VITE DEV MIDDLEWARE OR PRODUCTION STATIC ASSETS
  // ---------------------------------------------------------------------------
  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Goppo Kahini platform running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
