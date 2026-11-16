import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Headphones,
  LogOut,
  Mail,
  Play,
  Receipt,
  Settings,
  Shield,
  Sparkles,
  Ticket,
  XCircle,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../firebase';
import {
  ensureBootstrappedAdminDoc,
  formatFirebaseAuthError,
  hydrateClientUserFromFirestore,
  isEmbeddedIframe,
  syncUserAccountToFirestore,
} from '../services/firestoreService';
import type {
  Episode,
  Language,
  OrderRecord,
  PlaybackProgress,
  StoryItem,
  UserProfile,
} from '../types/content';
import type { UIStrings } from '../i18n/translations';
import {
  getRemainingListens,
  getStoryProgress,
  hasExhaustedListens,
  hasVerifiedStoryAccess,
  isFreeStory,
  isPurchasedStory,
} from '../utils/contentClassification';
import { ArtworkImage } from './ArtworkImage';
import { StoryCard } from './StoryCard';
import { StoryProgressIndicator } from './StoryProgressIndicator';

interface UserLibraryViewProps {
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  t: UIStrings;
  user: UserProfile | null;
  storiesInLanguage: StoryItem[];
  allStories: StoryItem[];
  orders: OrderRecord[];
  progress: PlaybackProgress[];
  initialTab?: string;
  onLoginSuccess: (payload: {
    token: string;
    user: UserProfile;
    orders: OrderRecord[];
    progress: PlaybackProgress[];
  }) => void;
  onLogout: () => void;
  onOpenDetails: (storyId: string) => void;
  onBuyTicket: (story: StoryItem) => void;
  onPlayTrailer: (story: StoryItem) => void;
  onResumeTrack: (story: StoryItem, episode: Episode | undefined, isTrailer: boolean, pos: number) => void;
  onOpenAdmin: () => void;
}

type LibraryTab =
  | 'my_stories'
  | 'continue'
  | 'purchased'
  | 'requires_ticket'
  | 'transactions'
  | 'account';

const VALID_TABS: LibraryTab[] = [
  'my_stories',
  'continue',
  'purchased',
  'requires_ticket',
  'transactions',
  'account',
];

function normalizeTab(tab?: string): LibraryTab | undefined {
  if (!tab) return undefined;
  if (tab === 'npass_content') return 'requires_ticket';
  return VALID_TABS.includes(tab as LibraryTab) ? (tab as LibraryTab) : undefined;
}

export const UserLibraryView: React.FC<UserLibraryViewProps> = ({
  language,
  onChangeLanguage,
  t,
  user,
  storiesInLanguage,
  allStories,
  orders,
  progress,
  initialTab,
  onLoginSuccess,
  onLogout,
  onOpenDetails,
  onBuyTicket,
  onPlayTrailer,
  onResumeTrack,
  onOpenAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<LibraryTab>(
    normalizeTab(initialTab) || (user ? 'my_stories' : 'account'),
  );
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [marketingConsentCapturedInSession, setMarketingConsentCapturedInSession] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [emailVerifiedStatus, setEmailVerifiedStatus] = useState<boolean>(
    () => auth?.currentUser?.emailVerified ?? true,
  );

  useEffect(() => {
    const normalized = normalizeTab(initialTab);
    if (normalized) {
      setActiveTab(normalized);
    }
  }, [initialTab]);

  useEffect(() => {
    setEmailVerifiedStatus(auth?.currentUser ? auth.currentUser.emailVerified : true);
  }, [user]);

  const completeFirebaseUserSession = async (
    fbUser: User,
    forceTokenRefresh = false,
    customNameOverride?: string,
  ): Promise<boolean> => {
    await ensureBootstrappedAdminDoc(fbUser).catch(() => {});
    await syncUserAccountToFirestore(fbUser, language).catch(() => {});
    const idToken = await fbUser.getIdToken(forceTokenRefresh);

    let resolvedPayload: {
      user: UserProfile;
      orders: OrderRecord[];
      progress: PlaybackProgress[];
    } | null = null;

    try {
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          language,
          name: (customNameOverride || fbUser.displayName || '').trim() || undefined,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) {
          setAuthError(data.error || 'Firebase authentication verification failed.');
          return false;
        }
        resolvedPayload = {
          user: data.user,
          orders: data.orders || [],
          progress: data.progress || [],
        };
      }
    } catch {
      // Static Firebase Hosting or offline fallback continues to Firestore client hydration
    }

    if (!resolvedPayload) {
      resolvedPayload = await hydrateClientUserFromFirestore(fbUser, language);
    }

    setEmailVerifiedStatus(fbUser.emailVerified);
    setPasswordInput('');
    onLoginSuccess({
      token: idToken,
      user: resolvedPayload.user,
      orders: resolvedPayload.orders,
      progress: resolvedPayload.progress,
    });
    return true;
  };

  const handleGoogleFirebaseLogin = async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      setAuthError('Firebase বর্তমানে বন্ধ রয়েছে। অনুগ্রহ করে ইমেইল দিয়ে লগইন করুন।');
      return;
    }
    setAuthError(null);
    setAuthNotice(null);
    setAuthBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const ok = await completeFirebaseUserSession(cred.user, false);
      if (ok) {
        setActiveTab('my_stories');
      }
    } catch (err) {
      const formatted = formatFirebaseAuthError(err, language);
      if (formatted.isCancelled) {
        setAuthError(null);
      } else if (formatted.code === 'auth/popup-blocked' && !isEmbeddedIframe()) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          setAuthError(formatFirebaseAuthError(redirectErr, language).message);
        }
      } else {
        setAuthError(formatted.message);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!isFirebaseConfigured || !auth) return;
    setAuthError(null);
    setAuthNotice(null);
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setAuthError(t.library.enterEmailForReset);
      return;
    }
    setAuthBusy(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setAuthNotice(t.library.passwordResetSent);
    } catch (err) {
      const formatted = formatFirebaseAuthError(err, language);
      setAuthError(formatted.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!isFirebaseConfigured || !auth?.currentUser) return;
    setAuthError(null);
    setAuthNotice(null);
    setAuthBusy(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice(t.library.verificationEmailSent);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err, language).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRefreshVerification = async () => {
    if (!isFirebaseConfigured || !auth?.currentUser) return;
    setAuthError(null);
    setAuthNotice(null);
    setAuthBusy(true);
    try {
      await auth.currentUser.reload();
      const updatedUser = auth.currentUser;
      setEmailVerifiedStatus(updatedUser.emailVerified);
      if (updatedUser.emailVerified) {
        await completeFirebaseUserSession(updatedUser, true);
        setAuthNotice(
          language === 'bn'
            ? 'আপনার ইমেইল সফলভাবে যাচাইকৃত হয়েছে!'
            : 'आपका ईमेल सफलतापूर्वक सत्यापित हो गया है!',
        );
      } else {
        setAuthNotice(
          language === 'bn'
            ? 'ইমেইল এখনো যাচাই সম্পন্ন হয়নি। অনুগ্রহ করে ইনবক্সের ভেরিফিকেশন লিংকে ক্লিক করুন।'
            : 'ईमेल अभी सत्यापित नहीं हुआ है। कृपया अपने इनबॉक्स में दिए लिंक पर क्लिक करें।',
        );
      }
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err, language).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    const trimmedEmail = emailInput.trim();
    const trimmedName = nameInput.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setAuthError(
        language === 'bn'
          ? 'অনুগ্রহ করে একটি সঠিক ইমেইল ঠিকানা লিখুন।'
          : 'कृपया एक वैध ईमेल पता दर्ज करें।',
      );
      return;
    }

    if (isRegisterMode && !agreeTerms) {
      setAuthError(
        language === 'bn'
          ? 'রেজিস্ট্রেশন সম্পন্ন করতে ব্যবহারের শর্তাবলীতে (Terms & Conditions) সম্মতি দিন।'
          : 'रजिस्ट्रेशन पूरा करने के लिए कृपया उपयोग की शर्तों (Terms & Conditions) से सहमत हों।',
      );
      return;
    }

    setAuthBusy(true);
    try {
      if (isFirebaseConfigured && auth) {
        if (!passwordInput || (isRegisterMode && passwordInput.length < 6)) {
          setAuthError(
            language === 'bn'
              ? 'কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।'
              : 'कृपया कम से कम 6 अक्षरों का पासवर्ड दर्ज करें।',
          );
          return;
        }

        if (isRegisterMode) {
          const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, passwordInput);
          if (trimmedName) {
            await updateProfile(cred.user, { displayName: trimmedName }).catch(() => {});
          }
          let verificationSent = false;
          try {
            await sendEmailVerification(cred.user);
            verificationSent = true;
          } catch {
            // Non-blocking if rate-limited
          }
          if (marketingConsent) {
            setMarketingConsentCapturedInSession(true);
          }
          const ok = await completeFirebaseUserSession(cred.user, true, trimmedName);
          if (ok) {
            if (verificationSent) {
              setAuthNotice(t.library.verificationEmailSent);
              setActiveTab('account');
            } else {
              setActiveTab('my_stories');
            }
          }
        } else {
          const cred = await signInWithEmailAndPassword(auth, trimmedEmail, passwordInput);
          const ok = await completeFirebaseUserSession(cred.user, false);
          if (ok) {
            setActiveTab('my_stories');
          }
        }
        return;
      }

      // Non-Firebase Express local fallback only
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmedEmail,
          name: trimmedName,
          language,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setAuthError(
          language === 'bn'
            ? 'অথেন্টিকেশন সার্ভারের সাথে সংযোগ করা যাচ্ছে না।'
            : 'प्रमाणीकरण सर्वर से संपर्क नहीं हो पा रहा है।',
        );
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Unable to sign in.');
        return;
      }
      if (isRegisterMode && marketingConsent) {
        setMarketingConsentCapturedInSession(true);
      }
      onLoginSuccess(data);
      setActiveTab('my_stories');
    } catch (err) {
      if (isFirebaseConfigured) {
        setAuthError(formatFirebaseAuthError(err, language).message);
      } else {
        setAuthError('Network error while signing in.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const purchasedStories = storiesInLanguage.filter((s) => isPurchasedStory(user, s));
  const myAccessibleStories = storiesInLanguage.filter(
    (s) => isFreeStory(s) || isPurchasedStory(user, s),
  );
  const requiresTicketStories = storiesInLanguage.filter(
    (s) => !isFreeStory(s) && !isPurchasedStory(user, s),
  );

  // Filter continue listening items matching the selected language
  const localizedProgress = progress
    .map((item) => {
      const story = allStories.find((s) => s.id === item.storyId);
      if (!story || story.language !== language) return null;
      const episode = item.isTrailer
        ? undefined
        : story.episodes.find((ep) => ep.id === item.episodeId);
      return { item, story, episode };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const tabs: Array<{ id: LibraryTab; label: string }> = [
    { id: 'my_stories', label: t.library.tabMyStories },
    { id: 'continue', label: t.library.tabContinue },
    { id: 'purchased', label: t.library.tabPurchased },
    { id: 'requires_ticket', label: t.library.tabRequiresTicket },
    { id: 'transactions', label: t.library.tabTransactions },
    { id: 'account', label: t.library.tabAccount },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Free Platform Summary Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div className="space-y-1">
          <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#F5F2EB]">
            {t.library.pageTitle}
          </h1>
          <p className="text-sm text-[#A69E95]">{t.library.pageSubtitle}</p>
        </div>

        {/* Free Account Quick Badge */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs sm:text-sm">
            <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-300">{t.library.freeAccountBadge}</span>
          </div>

          {user && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono-num text-[#F5F2EB]">
              <Ticket className="h-3.5 w-3.5 text-[#EF4444]" />
              <span>{user.purchasedStoryIds.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Segmented Tab Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent border border-red-500/35 text-red-400 shadow-sm'
                : 'bg-white/[0.03] hover:bg-white/[0.06] text-[#A69E95] hover:text-[#F5F2EB] border border-white/[0.04]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* If Logged Out and Not on Account Tab or Browse Tab, Prompt Free Sign-In Cleanly */}
      {!user && activeTab !== 'account' && activeTab !== 'requires_ticket' ? (
        <div className="rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] p-8 text-center max-w-xl mx-auto space-y-4 shadow-xl">
          <Headphones className="h-8 w-8 text-[#EF4444] mx-auto" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t.library.freeRegistrationBadge}</span>
          </div>
          <h2 className="font-editorial text-xl font-bold text-[#F5F2EB]">
            {t.library.signInHeading}
          </h2>
          <p className="text-sm text-[#A69E95]">{t.library.signInSubtitle}</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(false);
                setActiveTab('account');
              }}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-sm font-semibold transition-all shadow-md shadow-red-950/30 cursor-pointer"
            >
              {t.library.signInButton}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(true);
                setActiveTab('account');
              }}
              className="px-5 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-[#F5F2EB] text-sm font-semibold transition-all cursor-pointer"
            >
              {t.library.createAccountButton}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* TAB 1: MY STORIES (Purchased + Free Content) */}
          {activeTab === 'my_stories' && (
            <div className="space-y-6">
              {myAccessibleStories.length === 0 ? (
                <div className="rounded-2xl bg-gradient-to-b from-[#141117] to-[#0A090D] border border-white/[0.06] p-8 text-center space-y-3">
                  <p className="text-sm text-[#A69E95]">{t.library.emptyPurchased}</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('requires_ticket')}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-[#EF4444] cursor-pointer"
                  >
                    {t.library.tabRequiresTicket} →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                  {myAccessibleStories.map((story) => (
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
                      onOpenDetails={onOpenDetails}
                      onBuyTicket={onBuyTicket}
                      onPlayTrailer={onPlayTrailer}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONTINUE LISTENING */}
          {activeTab === 'continue' && (
            <div className="space-y-4">
              {localizedProgress.length === 0 ? (
                <div className="rounded-2xl bg-gradient-to-b from-[#141117] to-[#0A090D] border border-white/[0.06] p-8 text-center text-sm text-[#A69E95]">
                  {t.library.emptyContinue}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {localizedProgress.map(({ item, story, episode }) => (
                    <div
                      key={`${item.storyId}_${item.episodeId}`}
                      className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-b from-[#151219] to-[#0D0B10] border border-white/[0.06] shadow-sm"
                    >
                      <div className="h-20 w-16 rounded-lg overflow-hidden shrink-0 border border-white/[0.08]">
                        <ArtworkImage
                          srcKeyOrUrl={story.coverArt}
                          alt={story.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <h3 className="font-editorial text-base font-bold text-[#F5F2EB] truncate">
                            {story.title}
                          </h3>
                          <p className="text-xs text-[#A69E95] truncate">
                            {item.isTrailer
                              ? story.trailerTitle
                              : episode?.title || story.title}
                          </p>
                        </div>

                        <StoryProgressIndicator
                          progressSeconds={item.positionSeconds}
                          durationSeconds={item.durationSeconds}
                          t={t}
                        />

                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              onResumeTrack(
                                story,
                                episode,
                                item.isTrailer,
                                item.positionSeconds,
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs text-[#EF4444] hover:text-[#F87171] font-semibold cursor-pointer"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>{t.hero.listenNow}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INDIVIDUALLY PURCHASED CONTENT */}
          {activeTab === 'purchased' && (
            <div>
              {purchasedStories.length === 0 ? (
                <div className="rounded-2xl bg-gradient-to-b from-[#141117] to-[#0A090D] border border-white/[0.06] p-8 text-center text-sm text-[#A69E95]">
                  {t.library.emptyPurchased}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                  {purchasedStories.map((story) => (
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
                      onOpenDetails={onOpenDetails}
                      onBuyTicket={onBuyTicket}
                      onPlayTrailer={onPlayTrailer}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: BROWSE MORE PREMIUM STORIES */}
          {activeTab === 'requires_ticket' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {requiresTicketStories.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  t={t}
                  hasTicket={false}
                  unlockedViaNPass={false}
                  remainingListens={getRemainingListens(user, story.id)}
                  exhaustedListens={hasExhaustedListens(user, story.id)}
                  progressItem={getStoryProgress(story.id, progress)}
                  onOpenDetails={onOpenDetails}
                  onBuyTicket={onBuyTicket}
                  onPlayTrailer={onPlayTrailer}
                />
              ))}
            </div>
          )}

          {/* TAB 5: PURCHASE HISTORY & TRANSACTION STATUS */}
          {activeTab === 'transactions' && (
            <div className="space-y-3">
              {orders.length === 0 ? (
                <div className="rounded-2xl bg-gradient-to-b from-[#141117] to-[#0A090D] border border-white/[0.06] p-8 text-center text-sm text-[#A69E95]">
                  {t.library.emptyTransactions}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#141117] to-[#0B090E] divide-y divide-white/[0.04] overflow-hidden">
                  {orders.map((ord) => (
                    <div
                      key={ord.orderId}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Receipt className="h-4 w-4 text-[#EF4444]" />
                          <span className="font-editorial font-semibold text-[#F5F2EB]">
                            {ord.itemTitle}
                          </span>
                          {ord.isSandboxVerification && (
                            <span className="text-xs text-red-400">
                              · {t.library.sandboxTag}
                            </span>
                          )}
                        </div>
                        <p className="font-mono-num text-xs text-[#A69E95]">
                          {ord.orderId} · {new Date(ord.createdAt).toLocaleString()} ·{' '}
                          {ord.paymentMethod.toUpperCase()}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <span className="font-mono-num text-base font-bold text-[#F5F2EB]">
                          ₹{ord.amountInr}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                          {ord.status === 'VERIFIED' && (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-[#EF4444]" />
                              <span className="text-[#EF4444]">{t.library.statusVerified}</span>
                            </>
                          )}
                          {ord.status === 'FAILED' && (
                            <>
                              <XCircle className="h-4 w-4 text-red-400" />
                              <span className="text-red-400">{t.library.statusFailed}</span>
                            </>
                          )}
                          {ord.status === 'PENDING' && (
                            <>
                              <Clock className="h-4 w-4 text-[#A69E95]" />
                              <span className="text-[#A69E95]">{t.library.statusPending}</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: ACCOUNT SETTINGS & FREE LOGIN / REGISTRATION */}
          {activeTab === 'account' && (
            <div className="max-w-xl mx-auto">
              {user ? (
                <div className="rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] p-6 space-y-6 shadow-xl">
                  <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
                    <div className="flex items-center gap-3">
                      <Settings className="h-5 w-5 text-[#EF4444]" />
                      <div>
                        <h2 className="font-editorial text-lg font-bold text-[#F5F2EB]">
                          {t.library.accountSettingsHeading}
                        </h2>
                        <p className="text-xs text-[#A69E95]">{user.email}</p>
                      </div>
                    </div>
                    {(user.role === 'admin' || user.role === 'editor') && (
                      <button
                        type="button"
                        onClick={onOpenAdmin}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-red-500/30 text-xs font-semibold text-red-400 cursor-pointer"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        <span>{t.nav.admin}</span>
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[#C8BFB5] leading-relaxed rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
                    {t.library.freeAccountSummary}
                  </p>

                  {isFirebaseConfigured && auth?.currentUser && !emailVerifiedStatus && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-2.5 text-xs text-amber-200">
                      <div className="flex items-start gap-2">
                        <Mail className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">{t.library.emailNotVerifiedBanner}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 pl-6">
                        <button
                          type="button"
                          disabled={authBusy}
                          onClick={handleResendVerification}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-amber-200 font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {t.library.resendVerificationEmail}
                        </button>
                        <button
                          type="button"
                          disabled={authBusy}
                          onClick={handleRefreshVerification}
                          className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[#F5F2EB] font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {t.library.refreshVerificationStatus}
                        </button>
                      </div>
                    </div>
                  )}

                  {authNotice && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                      {authNotice}
                    </div>
                  )}

                  {authError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                      {authError}
                    </div>
                  )}

                  {marketingConsentCapturedInSession && (
                    <p className="text-xs text-emerald-300 rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3">
                      {t.library.marketingConsentPendingNote}
                    </p>
                  )}

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
                      <span className="text-[#A69E95]">{t.library.nameLabel}</span>
                      <span className="font-medium text-[#F5F2EB]">{user.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
                      <span className="text-[#A69E95]">{t.switchLanguagePrompt}</span>
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => onChangeLanguage('bn')}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            language === 'bn'
                              ? 'bg-[#EF4444] text-white'
                              : 'bg-white/[0.04] text-[#A69E95] hover:text-[#F5F2EB]'
                          }`}
                        >
                          বাংলা
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeLanguage('hi')}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            language === 'hi'
                              ? 'bg-[#EF4444] text-white'
                              : 'bg-white/[0.04] text-[#A69E95] hover:text-[#F5F2EB]'
                          }`}
                        >
                          हिंदी
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[#A69E95]">{t.library.tabPurchased}</span>
                      <span className="font-mono-num font-semibold text-[#EF4444]">
                        {user.purchasedStoryIds.length}{' '}
                        <Ticket className="inline h-3.5 w-3.5 ml-1" />
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-b from-[#1C1216] to-[#120B0E] hover:from-[#24161B] hover:to-[#170E12] border border-red-500/30 text-sm font-semibold text-[#F5F2EB] transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 text-red-400" />
                    <span>{t.nav.logout}</span>
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleAuthSubmit}
                  className="rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] p-5 sm:p-8 space-y-5 shadow-xl"
                >
                  {/* Login vs Free Registration Switch */}
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0B090E] border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => setIsRegisterMode(false)}
                      className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        !isRegisterMode
                          ? 'bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white shadow-sm'
                          : 'text-[#A69E95] hover:text-[#F5F2EB]'
                      }`}
                    >
                      {t.nav.login}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRegisterMode(true)}
                      className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                        isRegisterMode
                          ? 'bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white shadow-sm'
                          : 'text-[#A69E95] hover:text-[#F5F2EB]'
                      }`}
                    >
                      {t.nav.register}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                      <Sparkles className="h-3 w-3" />
                      <span>{t.library.freeRegistrationBadge}</span>
                    </div>
                    <h2 className="font-editorial text-2xl font-bold text-[#F5F2EB]">
                      {isRegisterMode ? t.library.registerHeading : t.library.signInHeading}
                    </h2>
                    <p className="text-xs sm:text-sm text-[#A69E95]">
                      {isRegisterMode ? t.library.registerSubtitle : t.library.signInSubtitle}
                    </p>
                  </div>

                  {authNotice && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                      {authNotice}
                    </div>
                  )}

                  {authError && (
                    <div className="p-3 rounded-lg bg-gradient-to-b from-[#1C1216] to-[#120B0E] border border-red-500/30 text-xs text-[#F5F2EB]">
                      {authError}
                    </div>
                  )}

                  {isRegisterMode && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-[#A69E95]">
                        {t.library.nameLabel}
                      </label>
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder={language === 'bn' ? 'আপনার পুরো নাম' : 'आपका पूरा नाम'}
                        className="w-full h-11 px-3.5 rounded-xl bg-[#0B090E] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#A69E95]">
                      {t.library.emailLabel}
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="listener@example.com"
                      className="w-full h-11 px-3.5 rounded-xl bg-[#0B090E] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                    />
                  </div>

                  {isFirebaseConfigured && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-medium text-[#A69E95]">
                          {t.library.passwordLabel}
                        </label>
                        {!isRegisterMode && (
                          <button
                            type="button"
                            disabled={authBusy}
                            onClick={handlePasswordReset}
                            className="text-[11px] font-medium text-red-400 hover:text-red-300 cursor-pointer disabled:opacity-50"
                          >
                            {t.library.forgotPassword}
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={isRegisterMode ? 6 : undefined}
                          autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder={t.library.passwordPlaceholder}
                          className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-[#0B090E] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A69E95] hover:text-[#F5F2EB] cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                   {/* Registration Terms & Conditions & Marketing Consent */}
                  {isRegisterMode && (
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.07] p-3.5 space-y-3">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          required
                          checked={agreeTerms}
                          onChange={(e) => setAgreeTerms(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#0B090E] text-[#EF4444] accent-[#EF4444] cursor-pointer shrink-0"
                        />
                        <span className="text-xs text-[#F5F2EB]/90 leading-relaxed">
                          {language === 'bn'
                            ? 'আমি Goppo Kahini-এর ব্যবহারের শর্তাবলী (Terms & Conditions) এবং প্রাইভেসি পলিসিতে সম্মত আছি।'
                            : 'मैं Goppo Kahini की उपयोग की शर्तों (Terms & Conditions) और गोपनीयता नीति से सहमत हूँ।'}
                        </span>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={marketingConsent}
                          onChange={(e) => setMarketingConsent(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#0B090E] text-[#EF4444] accent-[#EF4444] cursor-pointer shrink-0"
                        />
                        <span className="text-xs text-[#F5F2EB]/90 leading-relaxed">
                          {t.library.marketingConsentText}
                        </span>
                      </label>
                      <p className="text-[11px] text-[#A69E95] pl-6">
                        {t.library.marketingConsentHelper}
                      </p>
                    </div>
                  )}

                  {isFirebaseConfigured && (
                    <>
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={handleGoogleFirebaseLogin}
                        className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 font-semibold text-sm transition-all shadow-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-3"
                      >
                        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.3 7.23 24 12 24z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 12s.43 3.88 1.19 5.42l4.09-3.15z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.7 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                          />
                        </svg>
                        <span>
                          {language === 'bn'
                            ? 'Google দিয়ে সাইন ইন করুন'
                            : 'Google से साइन इन करें'}
                        </span>
                      </button>

                      <div className="flex items-center gap-3 text-[11px] text-[#7D7670]">
                        <div className="h-px flex-1 bg-white/[0.08]" />
                        <span>{language === 'bn' ? 'অথবা ইমেইল' : 'या ईमेल'}</span>
                        <div className="h-px flex-1 bg-white/[0.08]" />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-semibold text-sm transition-all shadow-lg shadow-red-950/30 cursor-pointer disabled:opacity-60"
                  >
                    {isRegisterMode ? t.library.createAccountButton : t.library.signInButton}
                  </button>

                  <div className="pt-1 flex flex-col gap-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode((prev) => !prev);
                        setAuthError(null);
                        setAuthNotice(null);
                      }}
                      className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      {isRegisterMode ? t.library.switchToLogin : t.library.switchToRegister}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
