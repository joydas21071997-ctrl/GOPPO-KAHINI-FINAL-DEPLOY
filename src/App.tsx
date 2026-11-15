import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Crown,
  Film,
  Headphones,
  Play,
  Sparkles,
  Ticket,
} from 'lucide-react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from './firebase';
import { collection, doc, getDocFromServer, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { INITIAL_STORIES, INITIAL_CATEGORIES, NPASS_MONTHLY_PRICE_INR } from '../server/catalogSeed';
import {
  fetchPublishedAdsFromFirestore,
  syncPlaybackProgressToFirestore,
} from './services/firestoreService';
import { resolveArtworkUrl } from './utils/artworkRegistry';
import type {
  BootstrapPayload,
  CategoryConfig,
  ContentCategory,
  Episode,
  Language,
  OrderItemType,
  OrderRecord,
  PlaybackProgress,
  StoryItem,
  UserProfile,
  AdSettings,
} from './types/content';
import { TRANSLATIONS } from './i18n/translations';
import { Header, type ActiveRoute, type StoryCollectionFilter } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { StoryCarousel } from './components/StoryCarousel';
import { StoryCard } from './components/StoryCard';
import { StoryDetailsView } from './components/StoryDetailsView';
import { CheckoutModal } from './components/CheckoutModal';
import { AudioPlayer, type ActiveTrack } from './components/AudioPlayer';
import { UserLibraryView } from './components/UserLibraryView';
import { AdminStudioView } from './components/AdminStudioView';
import { Footer } from './components/Footer';
import { PolicyModal } from './components/PolicyModal';
import { NotificationPermissionModal } from './components/NotificationPermissionModal';
import { SplashScreen } from './components/SplashScreen';
import { SocialShareModal } from './components/SocialShareModal';
import { StoryProgressIndicator } from './components/StoryProgressIndicator';
import { AdSlotContainer } from './components/AdSlotContainer';
import { OfflineIndicator } from './components/PWAInstallButton';
import { ArtworkImage } from './components/ArtworkImage';
import { useIsMobileDevice } from './hooks/useIsMobileDevice';
import {
  createDefaultAdSettings,
  isAdAllowedOnDevice,
  normalizeAdSettings,
} from './utils/adConfig';
import {
  getRemainingListens,
  getStoryProgress,
  hasExhaustedListens,
  hasVerifiedStoryAccess,
  isFreeStory,
  isPremiumStory,
} from './utils/contentClassification';
import type { PolicyTabKey } from './data/policyData';

const STORAGE_LANG_KEY = 'goppo_kahini_lang';
const STORAGE_TOKEN_KEY = 'goppo_kahini_token';

const SEED_VISUAL_IDS = new Set([
  'bn-anim-bonbibi',
  'bn-anim-jochonar-chaya',
  'bn-film-antaral',
  'bn-film-ferighat',
  'hi-anim-tilism',
  'hi-anim-himalaya',
  'hi-film-banaras-raat',
  'hi-film-junction',
]);

const isAdminUploadedVisual = (story: StoryItem): boolean =>
  !SEED_VISUAL_IDS.has(story.id) ||
  Date.parse(story.updatedAt || '0') > Date.parse('2026-11-05T00:00:00.000Z');

const parseStoryIdFromLocation = (): string | null => {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/story\/([^/]+)\/?$/);
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]);
    } catch {
      return pathMatch[1];
    }
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('story');
};

const isAutomatedCrawler = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  if (navigator.webdriver) return true;
  return /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|facebot|twitterbot|whatsapp|telegrambot|crawler|spider|lighthouse/i.test(
    navigator.userAgent || '',
  );
};

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const deepId = parseStoryIdFromLocation();
    if (deepId) {
      const matched = INITIAL_STORIES.find((s) => s.id === deepId);
      if (matched) return matched.language;
    }
    const saved = localStorage.getItem(STORAGE_LANG_KEY);
    return saved === 'hi' ? 'hi' : 'bn';
  });

  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_TOKEN_KEY),
  );

  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(true);
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallApp = async () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      setInstallPromptEvent(null);
    } else {
      alert(
        language === 'bn'
          ? "অ্যাপটি ইনস্টল করতে আপনার ব্রাউজারের মেনু (⋮ বা ⎋ Share) থেকে 'Add to Home Screen' সিলেক্ট করুন।"
          : "To install app, select 'Add to Home Screen' from your browser menu (⋮ or ⎋ Share).",
      );
    }
  };

  const [stories, setStories] = useState<StoryItem[]>(() => [...INITIAL_STORIES]);
  const [categories, setCategories] = useState<CategoryConfig[]>(() =>
    INITIAL_CATEGORIES.map((c) => ({
      id: c.id,
      enabledByAdmin: c.enabledByAdmin,
      publishedCountBn: INITIAL_STORIES.filter(
        (s) => s.category === c.id && s.language === 'bn' && s.publicationStatus === 'published',
      ).length,
      publishedCountHi: INITIAL_STORIES.filter(
        (s) => s.category === c.id && s.language === 'hi' && s.publicationStatus === 'published',
      ).length,
    })),
  );
  const [nPassPriceInr, setNPassPriceInr] = useState<number>(9);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [progress, setProgress] = useState<PlaybackProgress[]>([]);
  const isMobileDevice = useIsMobileDevice();
  const [adSettings, setAdSettings] = useState<AdSettings>(() => {
    try {
      const saved = localStorage.getItem('goppo_kahini_ads');
      if (saved) return normalizeAdSettings(JSON.parse(saved), 'published');
    } catch {}
    return createDefaultAdSettings('published');
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [catalogHydrated, setCatalogHydrated] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeRoute, setActiveRoute] = useState<ActiveRoute>(() => {
    const deepStoryId = parseStoryIdFromLocation();
    if (deepStoryId) {
      return { view: 'story', storyId: deepStoryId };
    }
    return { view: 'home', category: 'audio' };
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (parseStoryIdFromLocation() || isAutomatedCrawler()) return false;
    try {
      if (sessionStorage.getItem('goppo_splash_seen') === '1') return false;
      sessionStorage.setItem('goppo_splash_seen', '1');
    } catch {}
    return true;
  });

  // Audio Player State
  const [activeTrack, setActiveTrack] = useState<ActiveTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [resumeSeconds, setResumeSeconds] = useState<number>(0);

  // Checkout Modal State
  const [checkoutTarget, setCheckoutTarget] = useState<{
    open: boolean;
    itemType: OrderItemType;
    story?: StoryItem;
  }>({ open: false, itemType: 'story_ticket' });
  const [listenLimitReachedStory, setListenLimitReachedStory] = useState<StoryItem | null>(null);

  // Share Modal State (used from Hero)
  const [heroShareStory, setHeroShareStory] = useState<StoryItem | null>(null);

  // Legal & Policy Pages Modal State
  const [policyOpen, setPolicyOpen] = useState<boolean>(false);
  const [policyTab, setPolicyTab] = useState<PolicyTabKey>('terms');

  const t = TRANSLATIONS[language];

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem(STORAGE_LANG_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      const stored = localStorage.getItem(STORAGE_TOKEN_KEY);
      if (stored && stored.split('.').length === 3) {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        setAuthToken(null);
        setUser(null);
      }
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const freshToken = await fbUser.getIdToken();
          localStorage.setItem(STORAGE_TOKEN_KEY, freshToken);
          setAuthToken(freshToken);
        } catch {
          // Token refresh failure handled on next API verification
        }
      } else {
        const stored = localStorage.getItem(STORAGE_TOKEN_KEY);
        if (stored && stored.split('.').length === 3) {
          localStorage.removeItem(STORAGE_TOKEN_KEY);
          setAuthToken(null);
          setUser(null);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setLoadError(null);

      let storiesData = [...INITIAL_STORIES];
      let categoriesData: CategoryConfig[] = INITIAL_CATEGORIES.map((c) => ({
        id: c.id,
        enabledByAdmin: c.enabledByAdmin,
        publishedCountBn: INITIAL_STORIES.filter((s) => s.category === c.id && s.language === 'bn' && s.publicationStatus === 'published').length,
        publishedCountHi: INITIAL_STORIES.filter((s) => s.category === c.id && s.language === 'hi' && s.publicationStatus === 'published').length,
      }));
      let nPassPrice = NPASS_MONTHLY_PRICE_INR;
      let fetchedUser: UserProfile | null = null;
      let fetchedOrders: OrderRecord[] = [];
      let fetchedProgress: PlaybackProgress[] = [];

      let latestAds: AdSettings | null = null;

      try {
        const res = await fetch('/api/bootstrap', {
          cache: 'no-store',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = (await res.json()) as BootstrapPayload;
          if (data.stories && data.stories.length > 0) storiesData = data.stories;
          if (data.categories) categoriesData = data.categories;
          if (data.nPassMonthlyPriceInr) nPassPrice = data.nPassMonthlyPriceInr;
          fetchedUser = data.user || null;
          fetchedOrders = data.orders || [];
          fetchedProgress = data.progress || [];
          if (data.adSettings) {
            latestAds = normalizeAdSettings(data.adSettings, 'published');
          }
        } else {
          throw new Error('Static hosting fallback');
        }
      } catch {
        // Fallback for static Firebase Hosting deployment where Express server is not running:
        if (isFirebaseConfigured && db) {
          try {
            const publishedStoriesQuery = query(
              collection(db, 'stories'),
              where('publicationStatus', '==', 'published'),
            );
            const snap = await getDocs(publishedStoriesQuery);
            if (!snap.empty) {
              const cloudStories: StoryItem[] = [];
              snap.forEach((docSnap) => {
                const d = docSnap.data() as StoryItem;
                if (d && d.id && d.title) cloudStories.push(d);
              });
              if (cloudStories.length > 0) {
                storiesData = cloudStories;
              }
            }
          } catch {
            // Keep INITIAL_STORIES fallback
          }
        }
      }

      // Always verify latest Published Ad Configuration directly from Firestore server
      // so static Hosting & installed Chrome PWAs stay 100% synchronized with Admin publishes.
      if (isFirebaseConfigured && db) {
        const firestoreAds = await fetchPublishedAdsFromFirestore();
        if (firestoreAds) {
          const fsTime = firestoreAds.publishedAt ? Date.parse(firestoreAds.publishedAt) : 0;
          const apiTime = latestAds?.publishedAt ? Date.parse(latestAds.publishedAt) : 0;
          if (!latestAds || fsTime >= apiTime || firestoreAds.version >= latestAds.version) {
            latestAds = firestoreAds;
          }
        }
      }

      if (latestAds && !cancelled) {
        setAdSettings(latestAds);
        try {
          localStorage.setItem('goppo_kahini_ads', JSON.stringify(latestAds));
        } catch {}
      }

      if (cancelled) return;
      setStories(storiesData);
      setCategories(categoriesData);
      setNPassPriceInr(nPassPrice);
      setUser(fetchedUser);
      setOrders(fetchedOrders);
      setProgress(fetchedProgress);

      // Match deep-linked story language if opened directly via /story/<id> or ?story=<id>
      const deepId = parseStoryIdFromLocation();
      if (deepId) {
        const found = storiesData.find((s) => s.id === deepId);
        if (found) {
          setLanguage(found.language);
        }
      }
      setCatalogHydrated(true);
      setLoading(false);
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  // Real-Time Firestore Listener + PWA Resume Refresh for Published Ad Configuration
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;

    const applyPublishedAds = (nextAds: AdSettings) => {
      setAdSettings(nextAds);
      try {
        localStorage.setItem('goppo_kahini_ads', JSON.stringify(nextAds));
      } catch {}
    };

    const refreshPublishedAds = async () => {
      if (isFirebaseConfigured && db) {
        try {
          const snap = await getDocFromServer(doc(db, 'ad_settings', 'published'));
          if (snap.exists()) {
            applyPublishedAds(normalizeAdSettings(snap.data(), 'published'));
            return;
          }
        } catch {
          // Try server API fallback below
        }
      }
      try {
        const res = await fetch('/api/ads/published', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.adSettings) {
            applyPublishedAds(normalizeAdSettings(data.adSettings, 'published'));
          }
        }
      } catch {
        // Offline mode uses last synced localStorage state
      }
    };

    if (isFirebaseConfigured && db) {
      unsubFirestore = onSnapshot(
        doc(db, 'ad_settings', 'published'),
        (snap) => {
          if (snap.exists()) {
            applyPublishedAds(normalizeAdSettings(snap.data(), 'published'));
          }
        },
        () => {
          // Non-fatal fallback if offline or document uninitialized
        },
      );
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshPublishedAds();
      }
    };
    const handleFocus = () => {
      void refreshPublishedAds();
    };
    const handleOnline = () => {
      void refreshPublishedAds();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      if (unsubFirestore) unsubFirestore();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Dynamic Social Bar & Popunder Script Injection (respects Master, Page, Device, and Ad-Free status)
  useEffect(() => {
    const isAdFree = user?.membership.status === 'ACTIVE' || activeRoute.view === 'admin';
    const currentPageKey =
      activeRoute.view === 'story'
        ? 'story_details'
        : activeRoute.view === 'all_stories' || activeRoute.view === 'npass'
          ? 'catalog'
          : 'home';
    const pageAllowed = adSettings.pages?.[currentPageKey] ?? true;

    const cleanupInjectedScripts = () => {
      document.querySelectorAll('[data-gk-ad-script="true"]').forEach((el) => el.remove());
    };

    if (isAdFree || !adSettings.enabled || !pageAllowed) {
      cleanupInjectedScripts();
      return;
    }

    const injectRawScriptSnippet = (id: string, snippet: string) => {
      if (!snippet || !snippet.trim()) return;
      try {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = snippet;
        const scriptTags = wrapper.getElementsByTagName('script');
        if (scriptTags.length > 0) {
          for (let i = 0; i < scriptTags.length; i++) {
            const original = scriptTags[i];
            const fresh = document.createElement('script');
            fresh.id = i === 0 ? id : `${id}-${i}`;
            fresh.setAttribute('data-gk-ad-script', 'true');
            Array.from(original.attributes).forEach((attr) => {
              if (attr.name !== 'id') {
                fresh.setAttribute(attr.name, attr.value);
              }
            });
            if (original.src) {
              fresh.src = original.src;
            } else if (original.textContent) {
              fresh.textContent = original.textContent;
            }
            document.body.appendChild(fresh);
          }
        } else {
          const trimmed = snippet.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
            const fresh = document.createElement('script');
            fresh.id = id;
            fresh.setAttribute('data-gk-ad-script', 'true');
            fresh.src = trimmed;
            fresh.async = true;
            document.body.appendChild(fresh);
          }
        }
      } catch {
        // Safe failover
      }
    };

    cleanupInjectedScripts();

    if (isAdAllowedOnDevice(adSettings, 'social_bar', isMobileDevice)) {
      const socialSnippet = isMobileDevice
        ? adSettings.socialBarMobileScript || adSettings.socialBarScript
        : adSettings.socialBarScript;
      if (socialSnippet) {
        injectRawScriptSnippet('gk-ad-social-bar', socialSnippet);
      }
    }

    if (isAdAllowedOnDevice(adSettings, 'popunder', isMobileDevice)) {
      const popSnippet = isMobileDevice
        ? adSettings.popunderMobileScript || adSettings.popunderScript
        : adSettings.popunderScript;
      if (popSnippet) {
        injectRawScriptSnippet('gk-ad-popunder', popSnippet);
      }
    }

    return () => {
      cleanupInjectedScripts();
    };
  }, [adSettings, user, isMobileDevice, activeRoute.view]);

  const handleLanguageChange = (nextLang: Language) => {
    if (nextLang === language) return;
    setLanguage(nextLang);
    if (activeRoute.view === 'story') {
      const currentStory = stories.find((s) => s.id === activeRoute.storyId);
      if (currentStory && currentStory.language !== nextLang) {
        setActiveRoute({ view: 'home', category: 'audio' });
      }
    }
  };

  // All published stories for the selected language, sorted newest/updated first
  const publishedLanguageStories = useMemo(() => {
    return [...stories]
      .filter((s) => s.language === language && s.publicationStatus === 'published')
      .sort((a, b) => {
        const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return timeB - timeA;
      });
  }, [stories, language]);

  const audioStories = useMemo(
    () => publishedLanguageStories.filter((s) => s.category === 'audio'),
    [publishedLanguageStories],
  );
  const uploadedAnimationStories = useMemo(
    () =>
      publishedLanguageStories.filter(
        (s) => s.category === 'animation' && isAdminUploadedVisual(s),
      ),
    [publishedLanguageStories],
  );
  const uploadedFilmStories = useMemo(
    () =>
      publishedLanguageStories.filter(
        (s) => s.category === 'films' && isAdminUploadedVisual(s),
      ),
    [publishedLanguageStories],
  );
  const animationVisualStories = useMemo(
    () => [...uploadedAnimationStories, ...uploadedFilmStories],
    [uploadedAnimationStories, uploadedFilmStories],
  );
  const visiblePublishedStories = useMemo(
    () =>
      publishedLanguageStories.filter(
        (s) => s.category === 'audio' || isAdminUploadedVisual(s),
      ),
    [publishedLanguageStories],
  );
  const freeStories = useMemo(
    () => visiblePublishedStories.filter((s) => isFreeStory(s)),
    [visiblePublishedStories],
  );
  const premiumStories = useMemo(
    () => visiblePublishedStories.filter((s) => isPremiumStory(s)),
    [visiblePublishedStories],
  );
  const popularPremiumAudioStories = useMemo(() => {
    const scored = [...audioStories].sort((a, b) => {
      const scoreA = (a.isFeaturedHero ? 10 : 0) + a.episodes.length;
      const scoreB = (b.isFeaturedHero ? 10 : 0) + b.episodes.length;
      return scoreB - scoreA;
    });
    return scored.slice(0, 3);
  }, [audioStories]);
  const otherAudioSeriesStories = useMemo(() => {
    const highlightedIds = new Set(popularPremiumAudioStories.map((s) => s.id));
    const remaining = audioStories.filter((s) => !highlightedIds.has(s.id));
    return remaining.length > 0 ? remaining : audioStories;
  }, [audioStories, popularPremiumAudioStories]);

  // Continue listening entries matching active language
  const localizedProgress = useMemo(() => {
    return progress
      .map((item) => {
        const story = stories.find((s) => s.id === item.storyId);
        if (!story || story.language !== language || story.publicationStatus !== 'published') {
          return null;
        }
        const episode = item.isTrailer
          ? undefined
          : story.episodes.find((ep) => ep.id === item.episodeId);
        return { item, story, episode };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [progress, stories, language]);

  // Search strictly within the selected language & visible catalog
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return visiblePublishedStories.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q) ||
        s.synopsis.toLowerCase().includes(q) ||
        s.writer.toLowerCase().includes(q),
    );
  }, [visiblePublishedStories, searchQuery]);

  // Hero Box story: owner-selected featured hero story or latest visible story in active language
  const featuredHeroStory = useMemo(() => {
    const explicitHero = visiblePublishedStories.find((s) => s.isFeaturedHero);
    if (explicitHero) return explicitHero;
    return visiblePublishedStories[0] || null;
  }, [visiblePublishedStories]);

  // Browser history synchronization for /story/<id>, legacy ?story=<id>, and home routes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const deepId = parseStoryIdFromLocation();
      if (deepId) {
        setActiveRoute({ view: 'story', storyId: deepId });
      } else {
        setActiveRoute({ view: 'home', category: 'audio' });
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Dynamic SEO metadata, canonical URL, and Schema.org JSON-LD synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const activeStory =
      activeRoute.view === 'story'
        ? stories.find((s) => s.id === activeRoute.storyId)
        : undefined;

    const baseOrigin = window.location.origin;
    const baseTitle = 'Goppo Kahini – Bengali & Hindi Audio Stories & Films';
    const baseDescription =
      'Stream original Bengali and Hindi audio stories, animations, and films on Goppo Kahini. Listen to free previews or unlock ad-free stories anytime.';
    const defaultOgImage = `${baseOrigin}/assets/aistudio/Glossy_Red_Infinity_Ribbon_Logo_2028e914.png`;

    const nextTitle = activeStory
      ? `${activeStory.title} – Goppo Kahini`
      : baseTitle;
    const nextDescription = activeStory
      ? `${activeStory.subtitle ? `${activeStory.subtitle}. ` : ''}${activeStory.synopsis}`.slice(0, 158)
      : baseDescription;
    const canonicalUrl = activeStory
      ? `${baseOrigin}/story/${encodeURIComponent(activeStory.id)}`
      : `${baseOrigin}/`;

    let ogImageUrl = defaultOgImage;
    if (activeStory) {
      const resolvedArt = resolveArtworkUrl(activeStory.coverArt);
      if (resolvedArt) {
        if (resolvedArt.startsWith('http://') || resolvedArt.startsWith('https://')) {
          ogImageUrl = resolvedArt;
        } else if (resolvedArt.startsWith('/')) {
          ogImageUrl = `${baseOrigin}${resolvedArt}`;
        }
      }
    }

    // Sync clean browser URL on in-app navigation while preserving legacy ?story= landing links
    const currentSearchStory = new URLSearchParams(window.location.search).get('story');
    if (activeRoute.view === 'story' && activeStory) {
      const targetPath = `/story/${encodeURIComponent(activeStory.id)}`;
      if (window.location.pathname !== targetPath && !currentSearchStory) {
        window.history.pushState({ storyId: activeStory.id }, '', targetPath);
      }
    } else if (activeRoute.view !== 'story' && window.location.pathname.startsWith('/story/')) {
      window.history.pushState({}, '', '/');
    }

    document.title = nextTitle;

    const setMetaContent = (selector: string, content: string) => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (el) el.setAttribute('content', content);
    };

    setMetaContent('meta[name="description"]', nextDescription);
    setMetaContent('meta[property="og:title"]', nextTitle);
    setMetaContent('meta[property="og:description"]', nextDescription);
    setMetaContent('meta[property="og:url"]', canonicalUrl);
    setMetaContent('meta[property="og:image"]', ogImageUrl);
    setMetaContent(
      'meta[property="og:locale"]',
      activeStory?.language === 'hi' ? 'hi_IN' : 'bn_IN',
    );
    setMetaContent('meta[name="twitter:title"]', nextTitle);
    setMetaContent('meta[name="twitter:description"]', nextDescription);
    setMetaContent('meta[name="twitter:image"]', ogImageUrl);

    let canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonicalUrl);

    const existingStoryLd = document.getElementById('dynamic-story-jsonld');
    if (activeStory) {
      const ldScript =
        (existingStoryLd as HTMLScriptElement | null) || document.createElement('script');
      ldScript.id = 'dynamic-story-jsonld';
      ldScript.type = 'application/ld+json';
      ldScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type':
          activeStory.category === 'films'
            ? 'Movie'
            : activeStory.category === 'animation'
              ? 'TVSeries'
              : 'CreativeWorkSeries',
        name: activeStory.title,
        headline: activeStory.subtitle || activeStory.title,
        description: activeStory.synopsis,
        url: canonicalUrl,
        image: ogImageUrl,
        inLanguage: activeStory.language === 'hi' ? 'hi' : 'bn',
        genre: activeStory.genre,
        author: {
          '@type': 'Person',
          name: activeStory.writer || 'Goppo Kahini Studio',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Goppo Kahini',
          url: baseOrigin,
        },
      });
      if (!existingStoryLd) {
        document.head.appendChild(ldScript);
      }
    } else if (existingStoryLd) {
      existingStoryLd.remove();
    }
  }, [activeRoute, stories]);

  const handleSelectHeroStory = async (storyId: string) => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/hero-selection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ storyId }),
      });
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories);
      }
    } catch {
      // Non-blocking error; server remains authoritative
    }
  };

  const checkUserStoryAccess = (story: StoryItem): boolean => {
    if (isFreeStory(story)) return true;
    return hasVerifiedStoryAccess(user, story);
  };

  const handlePlayTrailer = (story: StoryItem) => {
    setResumeSeconds(0);
    setActiveTrack({ story, isTrailer: true });
  };

  const handlePlayEpisode = (story: StoryItem, episode: Episode, startPos = 0) => {
    if (!checkUserStoryAccess(story)) {
      setCheckoutTarget({
        open: true,
        itemType: 'story_ticket',
        story,
      });
      return;
    }
    setResumeSeconds(startPos);
    setActiveTrack({ story, isTrailer: false, episode });
  };

  const handleBuyTicket = (story: StoryItem) => {
    setCheckoutTarget({ open: true, itemType: 'story_ticket', story });
  };

  const handleProgressSync = async (payload: {
    storyId: string;
    episodeId: string;
    isTrailer: boolean;
    positionSeconds: number;
    durationSeconds: number;
  }) => {
    if (!authToken || !user) return;
    if (isFirebaseConfigured && auth?.currentUser?.uid) {
      void syncPlaybackProgressToFirestore(auth.currentUser.uid, payload).catch(() => {});
    }
    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setProgress(data.progress || []);
      }
    } catch {
      // Non-blocking progress sync
    }
  };

  const handleEpisodeComplete = async (story: StoryItem, episode: Episode) => {
    if (!authToken || !user) return;
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(story.id)}/complete-listen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ episodeId: episode.id }),
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
      }
      if (Array.isArray(data.progress)) {
        setProgress(data.progress);
      }
      if (data.accessExpired) {
        setActiveTrack(null);
        setIsPlaying(false);
        setListenLimitReachedStory(story);
      }
    } catch {
      // Non-blocking completion sync; server remains authoritative
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth).catch(() => {});
    }
    if (authToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setOrders([]);
    setProgress([]);
    setActiveRoute({ view: 'home', category: 'audio' });
  };

  const activeTrackId = activeTrack
    ? activeTrack.isTrailer
      ? `${activeTrack.story.id}_trailer`
      : activeTrack.episode?.id
    : undefined;

  // Filtered stories for the dedicated All Stories / Category / Free / Premium catalog view
  const activeCollectionFilter: StoryCollectionFilter =
    activeRoute.view === 'all_stories'
      ? activeRoute.category || 'all'
      : activeRoute.view === 'npass'
        ? 'premium'
        : 'all';

  const catalogFilteredStories = useMemo(() => {
    switch (activeCollectionFilter) {
      case 'audio':
        return audioStories;
      case 'animation':
        return uploadedAnimationStories.length > 0
          ? uploadedAnimationStories
          : animationVisualStories;
      case 'films':
        return uploadedFilmStories.length > 0 ? uploadedFilmStories : animationVisualStories;
      case 'free':
        return freeStories;
      case 'premium':
        return premiumStories;
      case 'all':
      default:
        return visiblePublishedStories;
    }
  }, [
    activeCollectionFilter,
    audioStories,
    uploadedAnimationStories,
    uploadedFilmStories,
    animationVisualStories,
    freeStories,
    premiumStories,
    visiblePublishedStories,
  ]);

  const collectionTitle = useMemo(() => {
    switch (activeCollectionFilter) {
      case 'audio':
        return `${t.categories.audio} — ${t.languageName}`;
      case 'animation':
      case 'films':
        return `${t.racks.animationVisual} — ${t.languageName}`;
      case 'free':
        return `${t.racks.freeStories} — ${t.languageName}`;
      case 'premium':
        return `${t.racks.premiumStories} — ${t.languageName}`;
      case 'all':
      default:
        return t.racks.allStoriesTitle;
    }
  }, [activeCollectionFilter, t]);

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#1F0B0B]/70 text-[#F5F2EB] selection:bg-red-600/30 selection:text-white ${
        activeTrack ? 'pb-20' : ''
      }`}
    >
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* PWA / Web App Install Top Notification Bar */}
      {showInstallBanner && (
        <div className="sticky top-0 z-50 bg-gradient-to-r from-red-900 via-red-800 to-rose-900 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-between gap-2 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-2 w-2 rounded-full bg-white animate-ping shrink-0" />
            <span className="truncate">
              {language === 'bn'
                ? '📥 Goppo Kahini অ্যাপটি আপনার ডিভাইসে ইনস্টল করে রাখুন — এক ক্লিকে সরাসরি প্রবেশ করুন!'
                : '📥 Install Goppo Kahini Web App for instant cinematic access & offline ease!'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleInstallApp}
              className="px-3 py-1 rounded-lg bg-black/30 hover:bg-black/50 text-white font-bold text-xs transition-colors cursor-pointer border border-white/20 shadow-sm"
            >
              {language === 'bn' ? 'ইনস্টল করুন (Install)' : 'Install App'}
            </button>
            <button
              type="button"
              onClick={() => setShowInstallBanner(false)}
              className="p-1 rounded-lg hover:bg-black/20 text-white/80 hover:text-white cursor-pointer"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Interactive Notification Permission Modal */}
      <NotificationPermissionModal />
      <OfflineIndicator />

      <Header
        language={language}
        onChangeLanguage={handleLanguageChange}
        t={t}
        categories={categories}
        activeRoute={activeRoute}
        onNavigate={(r) => {
          setActiveRoute(r);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        user={user}
      />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center space-y-4">
            <div className="h-9 w-9 rounded-full border-2 border-[#EF4444] border-t-transparent animate-spin" />
            <p className="text-sm text-[#A69E95] tracking-wide">Goppo Kahini...</p>
          </div>
        ) : loadError ? (
          <div className="my-12 rounded-2xl bg-gradient-to-b from-[#181114] to-[#0E0B0D] border border-red-500/30 p-8 text-center space-y-3 shadow-xl">
            <p className="text-base text-[#F5F2EB]">{loadError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white text-sm font-semibold cursor-pointer shadow-md shadow-red-950/30"
            >
              Retry
            </button>
          </div>
        ) : searchQuery.trim() ? (
          /* LANGUAGE-FILTERED SEARCH RESULTS RACK */
          <section className="space-y-6 pb-12">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
              <h1 className="font-editorial text-2xl font-bold text-[#F5F2EB]">
                “{searchQuery.trim()}” — {t.languageName} ({searchResults.length})
              </h1>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs sm:text-sm text-red-400 hover:text-red-300 cursor-pointer"
              >
                {t.nav.clearSearch}
              </button>
            </div>

            {searchResults.length === 0 ? (
              <div className="rounded-2xl bg-[#161116] border border-white/10 p-12 text-center space-y-2">
                <h2 className="font-editorial text-xl font-bold text-[#F6F1E7]">
                  {t.cards.emptySearchTitle}
                </h2>
                <p className="text-sm text-[#B6ABA1]">{t.cards.emptySearchBody}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {searchResults.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    t={t}
                    hasTicket={
                      hasVerifiedStoryAccess(user, story) &&
                      Boolean(user?.purchasedStoryIds.includes(story.id))
                    }
                    unlockedViaNPass={Boolean(
                      user?.membership.status === 'ACTIVE' &&
                        (story.accessPolicy === 'npass_included' ||
                          story.accessPolicy === 'both'),
                    )}
                    remainingListens={getRemainingListens(user, story.id)}
                    exhaustedListens={hasExhaustedListens(user, story.id)}
                    progressItem={getStoryProgress(story.id, progress)}
                    onOpenDetails={(id) => {
                      setSearchQuery('');
                      setActiveRoute({ view: 'story', storyId: id });
                    }}
                    onBuyTicket={handleBuyTicket}
                    onPlayTrailer={handlePlayTrailer}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* VIEW 1: HOMEPAGE */}
            {activeRoute.view === 'home' && (
              <div className="space-y-8 pb-10">
                {/* 1. Hero Section featuring latest or admin-selected featured story */}
                {featuredHeroStory && (
                  <HeroBanner
                    story={featuredHeroStory}
                    allLanguageStories={visiblePublishedStories}
                    t={t}
                    user={user}
                    hasAccess={checkUserStoryAccess(featuredHeroStory)}
                    progressItem={getStoryProgress(featuredHeroStory.id, progress)}
                    onPlayTrailer={handlePlayTrailer}
                    onPlayFirstEpisode={(s) =>
                      s.episodes[0] && handlePlayEpisode(s, s.episodes[0])
                    }
                    onBuyTicket={handleBuyTicket}
                    onOpenDetails={(storyId) =>
                      setActiveRoute({ view: 'story', storyId })
                    }
                    onSelectHeroStory={handleSelectHeroStory}
                    onShare={(s) => setHeroShareStory(s)}
                  />
                )}

                {/* Quick Filter Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
                    <button
                      type="button"
                      onClick={() => setActiveRoute({ view: 'all_stories', category: 'audio' })}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-xs sm:text-sm font-medium text-[#F5F2EB] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <Headphones className="h-4 w-4 text-[#EF4444]" />
                      <span>{t.categories.audio}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoute({ view: 'all_stories', category: 'animation' })}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-xs sm:text-sm font-medium text-[#F5F2EB] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <Film className="h-4 w-4 text-[#EF4444]" />
                      <span>{t.nav.animation}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoute({ view: 'all_stories', category: 'free' })}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs sm:text-sm font-medium text-emerald-300 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <Sparkles className="h-4 w-4 text-emerald-400" />
                      <span>{t.nav.free}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoute({ view: 'all_stories', category: 'premium' })}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/30 text-xs sm:text-sm font-medium text-amber-300 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <Crown className="h-4 w-4 text-amber-400" />
                      <span>{t.nav.premium}</span>
                    </button>

                    {adSettings?.smartlinkUrl &&
                      user?.membership?.status !== 'ACTIVE' &&
                      (adSettings.pages?.home ?? true) &&
                      isAdAllowedOnDevice(adSettings, 'smartlink', isMobileDevice) && (
                        <a
                          href={adSettings.smartlinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 border border-purple-500/30 text-xs sm:text-sm font-semibold text-pink-300 whitespace-nowrap shrink-0 transition-all shadow-sm"
                        >
                          <Sparkles className="h-4 w-4 text-pink-400" />
                          <span>🔥 বিশেষ অফার</span>
                        </a>
                      )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveRoute({ view: 'all_stories', category: 'all' })}
                    className="text-xs sm:text-sm font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  >
                    {t.cards.viewAll} ({visiblePublishedStories.length}) →
                  </button>
                </div>

                {/* Home Ad Slot 1: Top (Below Hero & Quick Filter Strip) */}
                <AdSlotContainer
                  placement="home_top"
                  isAdFreeContent={user?.membership.status === 'ACTIVE'}
                  adSettings={adSettings}
                />

                {/* 2. Continue Listening (Rendered when user has synced playback progress) */}
                {localizedProgress.length > 0 && (
                  <section className="space-y-3.5 rounded-2xl bg-gradient-to-b from-[#141017]/90 to-[#0B090D]/90 border border-red-500/20 p-4 sm:p-5 shadow-lg">
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-[#EF4444]" />
                        <h2 className="font-editorial text-lg sm:text-xl font-bold text-[#F5F2EB]">
                          {t.racks.continueListening}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveRoute({ view: 'library', initialTab: 'continue' })
                        }
                        className="text-xs font-semibold text-[#EF4444] hover:text-red-300 cursor-pointer"
                      >
                        {t.cards.viewAll} →
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {localizedProgress.slice(0, 3).map(({ item, story, episode }) => (
                        <div
                          key={`${item.storyId}_${item.episodeId}`}
                          className="flex items-center gap-3.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07]"
                        >
                          <div
                            onClick={() => setActiveRoute({ view: 'story', storyId: story.id })}
                            className="h-16 w-14 rounded-lg overflow-hidden shrink-0 border border-white/[0.08] cursor-pointer"
                          >
                            <ArtworkImage
                              srcKeyOrUrl={story.coverArt}
                              alt={story.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <p className="font-editorial text-sm font-bold text-[#F5F2EB] truncate">
                              {story.title}
                            </p>
                            <p className="text-[11px] text-[#A69E95] truncate">
                              {item.isTrailer
                                ? story.trailerTitle
                                : episode?.title || story.title}
                            </p>
                            <StoryProgressIndicator
                              progressSeconds={item.positionSeconds}
                              durationSeconds={item.durationSeconds}
                              t={t}
                            />
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.isTrailer) {
                                    setResumeSeconds(item.positionSeconds);
                                    setActiveTrack({ story, isTrailer: true });
                                  } else if (episode) {
                                    handlePlayEpisode(story, episode, item.positionSeconds);
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#EF4444] hover:text-red-300 cursor-pointer"
                              >
                                <Play className="h-3 w-3 fill-current" />
                                <span>{t.hero.listenNow}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 3. Merged Popular & Premium Audio Series (Non-overlapping featured selection) */}
                <StoryCarousel
                  title={t.racks.popularPremiumStories}
                  subtitle={t.racks.popularPremiumSubtitle}
                  stories={popularPremiumAudioStories}
                  t={t}
                  user={user}
                  progress={progress}
                  onViewAll={() => setActiveRoute({ view: 'all_stories', category: 'premium' })}
                  onOpenDetails={(storyId) => setActiveRoute({ view: 'story', storyId })}
                  onBuyTicket={handleBuyTicket}
                  onPlayTrailer={handlePlayTrailer}
                />

                {/* Home Ad Slot 2: Middle (Between Popular Audio & Remaining Series) */}
                <AdSlotContainer
                  placement="home_middle"
                  isAdFreeContent={user?.membership.status === 'ACTIVE'}
                  adSettings={adSettings}
                />

                {/* 4. Audio Series (Remaining Audio Stories — zero card repetition) */}
                <StoryCarousel
                  title={t.racks.audioSeries}
                  subtitle={t.racks.audioSeriesSubtitle}
                  stories={otherAudioSeriesStories}
                  t={t}
                  user={user}
                  progress={progress}
                  onViewAll={() => setActiveRoute({ view: 'all_stories', category: 'audio' })}
                  onOpenDetails={(storyId) => setActiveRoute({ view: 'story', storyId })}
                  onBuyTicket={handleBuyTicket}
                  onPlayTrailer={handlePlayTrailer}
                />

                {/* 5. Consolidated Free Stories & Free Trailer Previews */}
                {freeStories.length > 0 ? (
                  <StoryCarousel
                    title={t.racks.freeStories}
                    subtitle={t.racks.freeStoriesSubtitle}
                    stories={freeStories}
                    t={t}
                    user={user}
                    progress={progress}
                    onViewAll={() => setActiveRoute({ view: 'all_stories', category: 'free' })}
                    onOpenDetails={(storyId) => setActiveRoute({ view: 'story', storyId })}
                    onBuyTicket={handleBuyTicket}
                    onPlayTrailer={handlePlayTrailer}
                  />
                ) : (
                  <section className="space-y-3.5 rounded-2xl bg-gradient-to-b from-[#0E1614]/85 via-[#0B1110]/85 to-[#090B0B]/85 border border-emerald-500/20 p-4 sm:p-5 shadow-lg shadow-black/40">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-emerald-400" />
                          <h2 className="font-editorial text-lg sm:text-xl font-bold text-[#F5F2EB]">
                            {t.racks.freeStories}
                          </h2>
                        </div>
                        <p className="text-xs text-[#9E968F] mt-0.5">
                          {t.racks.freeTrailersSubtitle}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                        {t.badges.trailerPreview}
                      </span>
                    </div>

                    <p className="text-xs text-[#C8BFB5] leading-relaxed">
                      {t.racks.emptyFreeStoriesNote}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {visiblePublishedStories.slice(0, 4).map((story) => (
                        <div
                          key={`free_preview_${story.id}`}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-emerald-500/35 transition-colors"
                        >
                          <div
                            onClick={() => setActiveRoute({ view: 'story', storyId: story.id })}
                            className="h-16 w-12 rounded-lg overflow-hidden shrink-0 border border-white/[0.08] cursor-pointer"
                          >
                            <ArtworkImage
                              srcKeyOrUrl={story.coverArt}
                              alt={story.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-300">
                              {t.badges.freePreview} · {story.trailerDurationLabel}
                            </span>
                            <h3
                              onClick={() => setActiveRoute({ view: 'story', storyId: story.id })}
                              className="font-editorial text-sm font-bold text-[#F5F2EB] truncate cursor-pointer hover:text-emerald-300"
                            >
                              {story.title}
                            </h3>
                            <button
                              type="button"
                              onClick={() => handlePlayTrailer(story)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 cursor-pointer"
                            >
                              <Play className="h-3 w-3 fill-current" />
                              <span>{t.hero.playTrailer}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Home Ad Slot 3: Bottom (Between Free Stories & Visual/Footer Section) */}
                <AdSlotContainer
                  placement="home_bottom"
                  isAdFreeContent={user?.membership.status === 'ACTIVE'}
                  adSettings={adSettings}
                />

                {/* 6. Reserved Empty Slot: Animation Series (Hidden until uploaded from Admin) */}
                <StoryCarousel
                  title={t.racks.animationRackTitle}
                  stories={uploadedAnimationStories}
                  t={t}
                  user={user}
                  progress={progress}
                  onViewAll={() => setActiveRoute({ view: 'all_stories', category: 'animation' })}
                  onOpenDetails={(storyId) => setActiveRoute({ view: 'story', storyId })}
                  onBuyTicket={handleBuyTicket}
                  onPlayTrailer={handlePlayTrailer}
                />

                {/* 7. Reserved Empty Slot: Short Films (Hidden until uploaded from Admin) */}
                <StoryCarousel
                  title={t.racks.filmsRackTitle}
                  stories={uploadedFilmStories}
                  t={t}
                  user={user}
                  progress={progress}
                  onViewAll={() => setActiveRoute({ view: 'all_stories', category: 'films' })}
                  onOpenDetails={(storyId) => setActiveRoute({ view: 'story', storyId })}
                  onBuyTicket={handleBuyTicket}
                  onPlayTrailer={handlePlayTrailer}
                />
              </div>
            )}

            {/* VIEW 2: FILTERABLE CATALOG VIEW (All Stories / Audio / Animation-Video / Free / Premium) */}
            {(activeRoute.view === 'all_stories' || activeRoute.view === 'npass') && (
              <div className="space-y-6 pb-12">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setActiveRoute({ view: 'home', category: 'audio' })}
                      className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#B6ABA1] hover:text-[#F6F1E7] mb-1 cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>{t.cards.backToHome}</span>
                    </button>
                    <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#F6F1E7]">
                      {collectionTitle} ({catalogFilteredStories.length})
                    </h1>
                    <p className="text-xs sm:text-sm text-[#B6ABA1]">
                      {t.racks.allStoriesSubtitle}
                    </p>
                  </div>
                </div>

                {/* Collection Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                  {(
                    [
                      { id: 'all', label: t.nav.stories },
                      { id: 'audio', label: t.nav.audio },
                      { id: 'animation', label: t.nav.animation },
                      { id: 'free', label: t.nav.free },
                      { id: 'premium', label: t.nav.premium },
                    ] as const
                  ).map((filterItem) => {
                    const isSelected =
                      activeCollectionFilter === filterItem.id ||
                      (filterItem.id === 'animation' && activeCollectionFilter === 'films');
                    return (
                      <button
                        key={filterItem.id}
                        type="button"
                        onClick={() =>
                          setActiveRoute({ view: 'all_stories', category: filterItem.id })
                        }
                        className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white shadow-sm'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#C8BFB5] border border-white/[0.06]'
                        }`}
                      >
                        {filterItem.label}
                      </button>
                    );
                  })}
                </div>

                {/* Catalog Ad Slot */}
                <AdSlotContainer
                  placement="catalog_inline"
                  isAdFreeContent={user?.membership.status === 'ACTIVE'}
                  adSettings={adSettings}
                />

                {catalogFilteredStories.length === 0 ? (
                  <div className="rounded-2xl bg-[#161116] border border-white/10 p-10 text-center space-y-3">
                    <h2 className="font-editorial text-xl font-bold text-[#F6F1E7]">
                      {activeCollectionFilter === 'free'
                        ? t.racks.freeStories
                        : activeCollectionFilter === 'animation' ||
                            activeCollectionFilter === 'films'
                          ? t.racks.animationVisual
                          : t.cards.emptyCollectionTitle}
                    </h2>
                    <p className="text-sm text-[#B6ABA1] max-w-xl mx-auto">
                      {activeCollectionFilter === 'free'
                        ? t.racks.emptyFreeStoriesNote
                        : activeCollectionFilter === 'animation' ||
                            activeCollectionFilter === 'films'
                          ? t.racks.emptyVisualSlotsNote
                          : t.cards.emptyCollectionBody}
                    </p>
                    {(activeCollectionFilter === 'free' ||
                      activeCollectionFilter === 'animation' ||
                      activeCollectionFilter === 'films') && (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveRoute({ view: 'all_stories', category: 'all' })
                        }
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
                      >
                        <Ticket className="h-3.5 w-3.5 text-[#EF4444]" />
                        <span>{t.cards.viewAll}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                    {catalogFilteredStories.map((story) => (
                      <StoryCard
                        key={story.id}
                        story={story}
                        t={t}
                        hasTicket={
                          hasVerifiedStoryAccess(user, story) &&
                          Boolean(user?.purchasedStoryIds.includes(story.id))
                        }
                        unlockedViaNPass={Boolean(
                          user?.membership.status === 'ACTIVE' &&
                            (story.accessPolicy === 'npass_included' ||
                              story.accessPolicy === 'both'),
                        )}
                        remainingListens={getRemainingListens(user, story.id)}
                        exhaustedListens={hasExhaustedListens(user, story.id)}
                        progressItem={getStoryProgress(story.id, progress)}
                        onOpenDetails={(storyId) =>
                          setActiveRoute({ view: 'story', storyId })
                        }
                        onBuyTicket={handleBuyTicket}
                        onPlayTrailer={handlePlayTrailer}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VIEW 3: STORY DETAILS & EPISODES */}
            {activeRoute.view === 'story' && (() => {
              const targetStory = stories.find((s) => s.id === activeRoute.storyId);
              if (!targetStory && !catalogHydrated) {
                return (
                  <div className="py-24 flex flex-col items-center justify-center space-y-4">
                    <div className="h-9 w-9 rounded-full border-2 border-[#EF4444] border-t-transparent animate-spin" />
                    <p className="text-sm text-[#A69E95] tracking-wide">Goppo Kahini...</p>
                  </div>
                );
              }
              if (!targetStory) {
                return (
                  <div className="py-16 text-center space-y-4">
                    <p className="text-base text-[#B6ABA1]">{t.cards.emptyCollectionTitle}</p>
                    <button
                      type="button"
                      onClick={() => setActiveRoute({ view: 'home', category: 'audio' })}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white text-sm font-semibold cursor-pointer shadow-md shadow-red-950/30"
                    >
                      {t.cards.backToHome}
                    </button>
                  </div>
                );
              }
              return (
                <StoryDetailsView
                  story={targetStory}
                  t={t}
                  user={user}
                  progress={progress}
                  activeTrackId={activeTrackId}
                  isPlaying={isPlaying}
                  adSettings={adSettings}
                  onBack={() => setActiveRoute({ view: 'home', category: 'audio' })}
                  onPlayTrailer={handlePlayTrailer}
                  onPlayEpisode={(s, ep) => handlePlayEpisode(s, ep, 0)}
                  onEpisodeComplete={handleEpisodeComplete}
                  onBuyTicket={handleBuyTicket}
                />
              );
            })()}

            {/* VIEW 4: USER LIBRARY & ACCOUNT */}
            {activeRoute.view === 'library' && (
              <UserLibraryView
                language={language}
                onChangeLanguage={handleLanguageChange}
                t={t}
                user={user}
                storiesInLanguage={visiblePublishedStories}
                allStories={stories}
                orders={orders}
                progress={progress}
                initialTab={activeRoute.initialTab}
                onLoginSuccess={(payload) => {
                  localStorage.setItem(STORAGE_TOKEN_KEY, payload.token);
                  setAuthToken(payload.token);
                  setUser(payload.user);
                  setOrders(payload.orders || []);
                  setProgress(payload.progress || []);
                }}
                onLogout={handleLogout}
                onOpenDetails={(storyId) =>
                  setActiveRoute({ view: 'story', storyId })
                }
                onBuyTicket={handleBuyTicket}
                onPlayTrailer={handlePlayTrailer}
                onResumeTrack={(story, ep, isTrailer, pos) => {
                  if (isTrailer) {
                    setResumeSeconds(pos);
                    setActiveTrack({ story, isTrailer: true });
                  } else if (ep) {
                    handlePlayEpisode(story, ep, pos);
                  }
                }}
                onOpenAdmin={() => setActiveRoute({ view: 'admin' })}
              />
            )}

            {/* VIEW 5: AUTHORIZED ADMIN STUDIO */}
            {activeRoute.view === 'admin' && (
              <AdminStudioView
                authToken={authToken}
                user={user}
                categories={categories}
                nPassPriceInr={nPassPriceInr}
                adSettings={adSettings}
                onAdSettingsUpdated={(updatedAds) => {
                  setAdSettings(updatedAds);
                  try {
                    localStorage.setItem('goppo_kahini_ads', JSON.stringify(updatedAds));
                  } catch {}
                }}
                onCatalogUpdated={(payload) => {
                  setStories(payload.stories);
                  setCategories(payload.categories);
                }}
                onAdminLoginSuccess={(payload) => {
                  localStorage.setItem(STORAGE_TOKEN_KEY, payload.token);
                  setAuthToken(payload.token);
                  setUser(payload.user);
                  setStories(payload.stories);
                  setCategories(payload.categories);
                }}
                onAdminLogout={handleLogout}
                onSwitchToLiveSite={() => {
                  setActiveRoute({ view: 'home', category: 'audio' });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
          </>
        )}
      </main>

      <Footer
        language={language}
        onChangeLanguage={handleLanguageChange}
        t={t}
        onNavigate={(r) => {
          setActiveRoute(r);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenPolicy={(tab) => {
          setPolicyTab(tab);
          setPolicyOpen(true);
        }}
      />

      {/* HERO SHARE MODAL */}
      {heroShareStory && (
        <SocialShareModal
          isOpen={Boolean(heroShareStory)}
          onClose={() => setHeroShareStory(null)}
          title={heroShareStory.title}
          url={
            typeof window !== 'undefined'
              ? `${window.location.origin}/story/${encodeURIComponent(heroShareStory.id)}`
              : undefined
          }
          t={t}
        />
      )}

      {/* COMPREHENSIVE LEGAL & POLICY PAGES MODAL */}
      <PolicyModal
        isOpen={policyOpen}
        initialTab={policyTab}
        language={language}
        onClose={() => setPolicyOpen(false)}
      />

      {/* TICKET CHECKOUT MODAL */}
      <CheckoutModal
        isOpen={checkoutTarget.open}
        itemType={checkoutTarget.itemType}
        story={checkoutTarget.story}
        nPassPriceInr={nPassPriceInr}
        language={language}
        t={t}
        user={user}
        authToken={authToken}
        onClose={() => setCheckoutTarget((prev) => ({ ...prev, open: false }))}
        onRequireLogin={() => {
          setCheckoutTarget((prev) => ({ ...prev, open: false }));
          setActiveRoute({ view: 'library', initialTab: 'account' });
        }}
        onOrderUpdated={({ user: updatedUser, orders: updatedOrders }) => {
          if (updatedUser) setUser(updatedUser);
          setOrders(updatedOrders);
        }}
      />

      {/* 2-FULL-LISTEN LIMIT REACHED DIALOG */}
      {listenLimitReachedStory && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-amber-400/35 p-6 space-y-4 shadow-2xl text-[#F5F2EB]">
            <div className="flex items-center gap-2.5 text-amber-300">
              <Ticket className="h-5 w-5 shrink-0" />
              <h2 className="font-editorial text-lg font-bold">
                {listenLimitReachedStory.title}
              </h2>
            </div>
            <p className="text-sm text-[#D1C8BE] leading-relaxed">
              {t.storyDetails.exhaustedListensNotice}
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  const s = listenLimitReachedStory;
                  setListenLimitReachedStory(null);
                  setCheckoutTarget({
                    open: true,
                    itemType: 'story_ticket',
                    story: s,
                  });
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-sm font-semibold cursor-pointer"
              >
                <Ticket className="h-4 w-4" />
                <span>
                  {t.storyDetails.repurchaseStoryTicket} · ₹{listenLimitReachedStory.ticketPriceInr}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setListenLimitReachedStory(null)}
                className="py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-[#C8BFB5] cursor-pointer"
              >
                {t.storyDetails.back}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERSISTENT MINI-PLAYER + EXPANDABLE DEDICATED FULL PLAYER */}
      <AudioPlayer
        track={activeTrack}
        authToken={authToken}
        t={t}
        canPlayEpisodes={activeTrack ? checkUserStoryAccess(activeTrack.story) : false}
        initialPositionSeconds={resumeSeconds}
        adSettings={adSettings}
        isAdFreeUser={user?.membership.status === 'ACTIVE'}
        onSelectEpisode={(s, ep) => handlePlayEpisode(s, ep, 0)}
        onEpisodeComplete={handleEpisodeComplete}
        onPlayingStateChange={setIsPlaying}
        onProgressSync={handleProgressSync}
        onClose={() => {
          setActiveTrack(null);
          setIsPlaying(false);
        }}
      />
    </div>
  );
}
