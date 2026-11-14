import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Film,
  Flame,
  Key,
  Languages,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Sparkles,
  Star,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Video,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  auth,
  db,
  getFirebasePublicMeta,
  googleProvider,
  isFirebaseConfigured,
  isFirebaseStorageConfigured,
  uploadMediaFileToFirebaseStorage,
} from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import {
  deleteEditorFromFirestore,
  deleteStoryFromFirestore,
  ensureBootstrappedAdminDoc,
  fetchFirestoreDiagnostics,
  syncCategoryToFirestore,
  syncEditorToFirestore,
  syncFullCatalogToFirestore,
  syncPlatformSettingToFirestore,
  syncStoryToFirestore,
  syncUserAccountToFirestore,
} from '../services/firestoreService';
import type {
  AccessPolicy,
  AdminPermission,
  CategoryConfig,
  ContentCategory,
  EditorGrant,
  Episode,
  Language,
  OrderRecord,
  PublicationStatus,
  StoryItem,
  UserProfile,
} from '../types/content';
import { ArtworkImage } from './ArtworkImage';

const EDITOR_PERMISSION_LABELS: Array<{
  key: AdminPermission;
  label: string;
  desc: string;
}> = [
  {
    key: 'manage_stories',
    label: 'গল্প তৈরি ও এডিট',
    desc: 'নতুন গল্প প্রকাশ, সম্পাদনা ও মুছে ফেলার অনুমতি',
  },
  {
    key: 'manage_media',
    label: 'অডিও/ভিডিও আপলোড',
    desc: 'অডিও, ভিডিও, পোস্টার এবং ভয়েস রেকর্ডিং আপলোড',
  },
  {
    key: 'manage_hero',
    label: 'হোমপেজ হিরো ("চলছে")',
    desc: 'প্রথম পেজের প্রধান ব্যানারে গল্প পরিবর্তন',
  },
  {
    key: 'translate_stories',
    label: 'হিন্দি অনুবাদ (AI)',
    desc: '১-ক্লিকে বাংলা থেকে হিন্দিতে অনুবাদ টুল ব্যবহার',
  },
  {
    key: 'manage_categories',
    label: 'ক্যাটাগরি দৃশ্যমানতা',
    desc: 'অডিও, অ্যানিমেশন ও ফিল্ম ক্যাটাগরি টগল করা',
  },
];

interface AdminStudioViewProps {
  authToken: string | null;
  user: UserProfile | null;
  categories: CategoryConfig[];
  nPassPriceInr?: number;
  onCatalogUpdated: (payload: {
    stories: StoryItem[];
    categories: CategoryConfig[];
  }) => void;
  onAdminLoginSuccess?: (payload: {
    token: string;
    user: UserProfile;
    stories: StoryItem[];
    categories: CategoryConfig[];
  }) => void;
  onAdminLogout?: () => void;
  onSwitchToLiveSite?: () => void;
}

const ARTWORK_PRESETS = [
  { key: 'bn_hero_zamindar', label: 'Bengali Zamindar Mansion (16:9 / Cover)' },
  { key: 'bn_cover_salbon', label: 'Bengali Sal Forest Lantern (3:4)' },
  { key: 'bn_cover_mandir', label: 'Bengali Terracotta Temple (3:4)' },
  { key: 'bn_cover_nouka', label: 'Bengali Foggy River Boat (3:4)' },
  { key: 'hi_hero_ghat', label: 'Hindi Banaras River Ghat (16:9 / Cover)' },
  { key: 'hi_cover_haveli', label: 'Hindi Sandstone Haveli (3:4)' },
  { key: 'hi_cover_train', label: 'Hindi Hill Station Night Train (3:4)' },
  { key: 'hi_cover_deodar', label: 'Hindi Deodar Forest Bungalow (3:4)' },
];

export const AdminStudioView: React.FC<AdminStudioViewProps> = ({
  authToken,
  user,
  categories,
  nPassPriceInr = 9,
  onCatalogUpdated,
  onAdminLoginSuccess,
  onAdminLogout,
  onSwitchToLiveSite,
}) => {
  // Tabs: 'catalog' | 'create_edit' | 'audio_recorder' | 'platform_settings' | 'firebase_hub' | 'users_orders' | 'editors_rbac'
  const [activeTab, setActiveTab] = useState<
    | 'catalog'
    | 'create_edit'
    | 'audio_recorder'
    | 'platform_settings'
    | 'firebase_hub'
    | 'users_orders'
    | 'editors_rbac'
  >('catalog');

  const [stories, setStories] = useState<StoryItem[]>([]);
  const [allOrders, setAllOrders] = useState<OrderRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allEditors, setAllEditors] = useState<EditorGrant[]>([]);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filter state for catalog view
  const [filterLang, setFilterLang] = useState<'all' | 'bn' | 'hi'>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | ContentCategory>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Firebase Auth Gate state (Strictly empty initial values — zero hardcoded credentials)
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Editor RBAC Management State (Owner/Admin only)
  const [editorEmailInput, setEditorEmailInput] = useState('');
  const [editorNameInput, setEditorNameInput] = useState('');
  const [editorUidInput, setEditorUidInput] = useState('');
  const [editorPermSelection, setEditorPermSelection] = useState<AdminPermission[]>([
    'manage_stories',
    'manage_media',
  ]);

  // Story Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLanguage, setFormLanguage] = useState<Language>('bn');
  const [formCategory, setFormCategory] = useState<ContentCategory>('audio');
  const [formMediaType, setFormMediaType] = useState<'audio' | 'video'>('audio');
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formGenre, setFormGenre] = useState('');
  const [formSynopsis, setFormSynopsis] = useState('');
  const [formWriter, setFormWriter] = useState('');
  const [formNarrator, setFormNarrator] = useState('');
  const [formCoverArt, setFormCoverArt] = useState('bn_cover_salbon');
  const [customArtworkUrl, setCustomArtworkUrl] = useState<string | null>(null);
  const [formDuration, setFormDuration] = useState('25m');
  const [formPrice, setFormPrice] = useState(9);
  const [formAccessPolicy, setFormAccessPolicy] = useState<AccessPolicy>('both');
  const [formPubStatus, setFormPubStatus] = useState<PublicationStatus>('published');
  const [formIsFeaturedHero, setFormIsFeaturedHero] = useState<boolean>(false);
  const [trailerAudioUrl, setTrailerAudioUrl] = useState<string>('');
  const [trailerVideoUrl, setTrailerVideoUrl] = useState<string>('');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [episodes, setEpisodes] = useState<
    Array<{
      id: string;
      title: string;
      durationLabel: string;
      audioUrl?: string;
      videoUrl?: string;
      mediaType?: 'audio' | 'video';
      synopsis: string;
    }>
  >([{ id: 'ep-1', title: 'পর্ব ১: সূচনা', durationLabel: '14:30', synopsis: '' }]);

  // Audio Recorder State (in-browser recording)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recorderTarget, setRecorderTarget] = useState<'trailer' | number>('trailer');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Platform & N Pass settings
  const [customNPassPrice, setCustomNPassPrice] = useState(nPassPriceInr);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [firestoreDiag, setFirestoreDiag] = useState<{
    checked: boolean;
    connected: boolean;
    message: string;
    storiesCount: number;
    categoriesCount: number;
    adminDocPresent: boolean;
  } | null>(null);
  const [rulesCopied, setRulesCopied] = useState(false);

  // Live Firebase Config Metadata
  const firebaseMeta = getFirebasePublicMeta();

  const isOwnerAdmin = user?.role === 'admin';
  const isAuthorizedStaff =
    user?.role === 'admin' ||
    (user?.role === 'editor' && (user.permissions?.length || 0) > 0);

  const hasPermission = (perm: AdminPermission): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'editor') {
      return Boolean(user.permissions?.includes(perm));
    }
    return false;
  };

  // Load catalog overview for verified Admin or Editor
  const fetchOverview = async (token = authToken) => {
    try {
      const res = await fetch('/api/admin/overview', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories || []);
        setAllOrders(data.orders || []);
        setAllUsers(data.users || []);
        setAllEditors(data.editors || []);
        if (data.nPassPriceInr) setCustomNPassPrice(data.nPassPriceInr);
        return;
      }
    } catch {
      // Non-blocking catch
    }

    // Direct Firestore fallback for static Firebase Hosting deployments
    if (db) {
      try {
        const storiesSnap = await getDocs(collection(db, 'stories'));
        const loadedStories: StoryItem[] = [];
        storiesSnap.forEach((d) => loadedStories.push(d.data() as StoryItem));
        if (loadedStories.length > 0) {
          setStories(loadedStories);
        }

        const editorsSnap = await getDocs(collection(db, 'editors'));
        const loadedEditors: EditorGrant[] = [];
        editorsSnap.forEach((d) => loadedEditors.push(d.data() as EditorGrant));
        setAllEditors(loadedEditors);

        const settingsSnap = await getDoc(doc(db, 'settings', 'platform'));
        if (settingsSnap.exists() && settingsSnap.data().nPassMonthlyPriceInr) {
          setCustomNPassPrice(settingsSnap.data().nPassMonthlyPriceInr);
        }
      } catch {
        // Non-blocking
      }
    }
  };

  useEffect(() => {
    if (authToken && isAuthorizedStaff) {
      fetchOverview();
    }
  }, [authToken, user]);

  // Flash banner clear timer
  useEffect(() => {
    if (statusBanner) {
      const timer = setTimeout(() => setStatusBanner(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusBanner]);

  const exchangeFirebaseTokenForStudio = async (idToken: string) => {
    let verifiedUser: UserProfile | null = null;

    try {
      const authRes = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });
      if (authRes.ok) {
        const authData = await authRes.json();
        verifiedUser = authData.user as UserProfile;
      }
    } catch {
      // Fall through to direct Firestore verification
    }

    if (!verifiedUser && auth?.currentUser) {
      const fbUser = auth.currentUser;
      const email = (fbUser.email || '').toLowerCase();
      const isOwner = email === 'joydas.21071997@gmail.com';

      let isAdmin = isOwner;
      if (!isAdmin && db) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
          isAdmin = adminSnap.exists();
        } catch {
          // ignore
        }
      }

      verifiedUser = {
        id: `usr_${fbUser.uid.slice(0, 10)}`,
        firebaseUid: fbUser.uid,
        name: fbUser.displayName || email.split('@')[0] || 'Admin',
        email: fbUser.email || '',
        role: isAdmin ? 'admin' : 'listener',
        permissions: isAdmin ? [
          'manage_stories',
          'manage_media',
          'manage_hero',
          'translate_stories',
          'manage_categories',
        ] : undefined,
        preferredLanguage: 'bn',
        purchasedStoryIds: [],
        storyEntitlements: {},
        membership: { planId: 'npass_monthly_9', priceInr: 9, status: 'INACTIVE' },
      };
    }

    if (!verifiedUser) {
      setAuthError('প্রমাণীকরণ ব্যর্থ হয়েছে।');
      return;
    }

    const isStaff =
      verifiedUser.role === 'admin' ||
      (verifiedUser.role === 'editor' && (verifiedUser.permissions?.length || 0) > 0);

    if (!isStaff) {
      setAuthError(
        'এই অ্যাকাউন্টটি অ্যাডমিন বা এডিটর হিসেবে অনুমোদিত নয়। অনুগ্রহ করে অনুমোদিত Owner/Admin অথবা Editor অ্যাকাউন্ট দিয়ে সাইন ইন করুন।',
      );
      return;
    }

    await fetchOverview(idToken);

    if (onAdminLoginSuccess) {
      onAdminLoginSuccess({
        token: idToken,
        user: verifiedUser,
        stories: stories,
        categories: categories,
      });
    }
    setStatusBanner(
      verifiedUser.role === 'admin'
        ? 'Firebase ভেরিফাইড Owner/Admin সেশন সক্রিয় হয়েছে!'
        : 'Firebase ভেরিফাইড Editor সেশন সক্রিয় হয়েছে!',
    );
  };

  const handleFirebaseGoogleLogin = async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      setAuthError('Firebase সংযোগ বর্তমানে ডিসেবেল করা আছে। নতুন Firebase প্রোজেক্ট যুক্ত করার পর সাইন-ইন চালু হবে।');
      return;
    }
    setAuthError(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await ensureBootstrappedAdminDoc(cred.user);
      await syncUserAccountToFirestore(cred.user, 'bn').catch(() => {});
      const idToken = await cred.user.getIdToken(true);
      await exchangeFirebaseTokenForStudio(idToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('auth/popup-closed-by-user') || msg.includes('popup-closed-by-user')) {
        setAuthError(null);
      } else if (msg.includes('unauthorized-domain')) {
        setAuthError('এই ডোমেইনটি লগইন সেটিংসে অনুমোদিত নয়।');
      } else if (msg.includes('popup-blocked')) {
        setAuthError('ব্রাউজার সাইন-ইন পপ-আপ ব্লক করেছে। অনুগ্রহ করে পপ-আপ অনুমতি দিন।');
      } else {
        setAuthError('গুগল সাইন-ইন সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleFirebaseEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFirebaseConfigured || !auth) {
      setAuthError('Firebase সংযোগ বর্তমানে ডিসেবেল করা আছে। নতুন Firebase প্রোজেক্ট যুক্ত করার পর সাইন-ইন চালু হবে।');
      return;
    }
    setAuthError(null);
    if (!authEmail.trim() || !authPassword) {
      setAuthError('বৈধ ইমেইল এবং পাসওয়ার্ড উভয়ই দিন।');
      return;
    }
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      await ensureBootstrappedAdminDoc(cred.user);
      await syncUserAccountToFirestore(cred.user, 'bn').catch(() => {});
      const idToken = await cred.user.getIdToken(true);
      setAuthPassword('');
      await exchangeFirebaseTokenForStudio(idToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('operation-not-allowed')) {
        setAuthError(
          'Firebase Console-এ Email/Password প্রোভাইডার চালু নেই। অনুগ্রহ করে উপরের Google সাইন-ইন ব্যবহার করুন।',
        );
      } else {
        setAuthError('ইমেইল বা পাসওয়ার্ড যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে সঠিক তথ্য দিন।');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEditorGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken || !isOwnerAdmin) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/editors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          email: editorEmailInput.trim(),
          name: editorNameInput.trim(),
          uid: editorUidInput.trim() || undefined,
          permissions: editorPermSelection,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusBanner(data.error || 'এডিটর অনুমোদন সংরক্ষণ ব্যর্থ হয়েছে।');
        return;
      }
      setAllEditors(data.editors || []);
      const savedGrant = (data.editors || []).find(
        (ed: EditorGrant) => ed.email.toLowerCase() === editorEmailInput.trim().toLowerCase(),
      );
      if (savedGrant?.uid) {
        void syncEditorToFirestore(savedGrant).catch(() => {});
      }
      setEditorEmailInput('');
      setEditorNameInput('');
      setEditorUidInput('');
      setStatusBanner('এডিটর ও অনুমতি সফলভাবে আপডেট করা হয়েছে!');
    } catch {
      setStatusBanner('এডিটর অনুমোদন সংরক্ষণে ত্রুটি হয়েছে।');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeEditor = async (email: string) => {
    if (!authToken || !isOwnerAdmin) return;
    if (!window.confirm(`আপনি কি নিশ্চিতভাবে "${email}"-এর এডিটর অনুমতি বাতিল করতে চান?`)) {
      return;
    }
    const existingGrant = allEditors.find((ed) => ed.email.toLowerCase() === email.toLowerCase());
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/editors/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setAllEditors(data.editors || []);
        if (existingGrant?.uid) {
          void deleteEditorFromFirestore(existingGrant.uid).catch(() => {});
        }
        setStatusBanner('এডিটর অ্যাক্সেস সফলভাবে বাতিল করা হয়েছে।');
      }
    } catch {
      setStatusBanner('অ্যাক্সেস বাতিল করতে সমস্যা হয়েছে।');
    } finally {
      setBusy(false);
    }
  };

  // Load story into form for editing
  const loadIntoForm = (s: StoryItem) => {
    setEditingId(s.id);
    setFormLanguage(s.language);
    setFormCategory(s.category);
    setFormMediaType(s.mediaType || (s.category === 'animation' || s.category === 'films' ? 'video' : 'audio'));
    setFormTitle(s.title);
    setFormSubtitle(s.subtitle || '');
    setFormGenre(s.genre);
    setFormSynopsis(s.synopsis);
    setFormWriter(s.writer);
    setFormNarrator(s.narrator);
    setFormCoverArt(s.coverArt);
    setCustomArtworkUrl(s.coverArt.startsWith('/api/') || s.coverArt.startsWith('http') ? s.coverArt : null);
    setFormDuration(s.totalDurationLabel);
    setFormPrice(s.ticketPriceInr);
    setFormAccessPolicy(s.accessPolicy);
    setFormPubStatus(s.publicationStatus);
    setFormIsFeaturedHero(Boolean(s.isFeaturedHero));
    setTrailerAudioUrl(s.trailerAudioUrl || '');
    setTrailerVideoUrl(s.trailerVideoUrl || '');
    setEpisodes(
      s.episodes.map((ep) => ({
        id: ep.id,
        title: ep.title,
        durationLabel: ep.durationLabel,
        audioUrl: ep.audioUrl,
        videoUrl: ep.videoUrl,
        mediaType: ep.mediaType || (s.category === 'animation' || s.category === 'films' ? 'video' : 'audio'),
        synopsis: ep.synopsis || '',
      })),
    );
    setActiveTab('create_edit');
  };

  // Reset form to blank new story
  const resetForm = () => {
    setEditingId(null);
    setFormTitle('');
    setFormSubtitle('');
    setFormGenre('');
    setFormSynopsis('');
    setFormWriter('');
    setFormNarrator('');
    setFormPrice(9);
    setFormAccessPolicy('both');
    setFormPubStatus('published');
    setFormIsFeaturedHero(false);
    setTrailerAudioUrl('');
    setTrailerVideoUrl('');
    setCustomArtworkUrl(null);
    const initialMediaType = formCategory === 'animation' || formCategory === 'films' ? 'video' : 'audio';
    setFormMediaType(initialMediaType);
    setEpisodes([
      {
        id: 'ep-1',
        title: formLanguage === 'bn' ? 'পর্ব ১: সূচনা' : 'अध्याय 1: आरंभ',
        durationLabel: '14:30',
        synopsis: '',
        mediaType: initialMediaType,
      },
    ]);
  };

  // 1-Click Auto Translate to Hindi via Gemini & Intelligent Literary Dictionary
  const handleTranslateToHindi = async () => {
    if (!formTitle && !formGenre && !formSynopsis) {
      setStatusBanner('প্রথমে অন্তত একটি শিরোনাম বা বিবরণ লিখুন যা রূপান্তর করতে চান।');
      return;
    }
    setIsTranslating(true);
    setStatusBanner('✨ স্বয়ংক্রিয় হিন্দিতে রূপান্তর চলছে...');
    try {
      const res = await fetch('/api/admin/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken || ''}`,
        },
        body: JSON.stringify({
          title: formTitle,
          subtitle: formSubtitle,
          genre: formGenre,
          synopsis: formSynopsis,
          episodes: episodes.map((e) => ({ title: e.title, synopsis: e.synopsis })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const tr = data.translation;
        if (tr) {
          setFormLanguage('hi');
          if (tr.title) setFormTitle(tr.title);
          if (tr.subtitle) setFormSubtitle(tr.subtitle);
          if (tr.genre) setFormGenre(tr.genre);
          if (tr.synopsis) setFormSynopsis(tr.synopsis);
          if (Array.isArray(tr.episodes) && tr.episodes.length > 0) {
            setEpisodes((prev) =>
              prev.map((ep, idx) => ({
                ...ep,
                title: tr.episodes[idx]?.title || `अध्याय ${idx + 1}`,
                synopsis: tr.episodes[idx]?.synopsis || ep.synopsis,
              })),
            );
          }
          if (formCoverArt.startsWith('bn_')) {
            setFormCoverArt(formCategory === 'animation' ? 'hi_cover_train' : 'hi_cover_haveli');
          }
          setStatusBanner('✨ সফলভাবে সম্পূর্ণ গল্পটি অটোমেটিক হিন্দিতে কনভার্ট করা হয়েছে!');
        }
      } else {
        setStatusBanner('অনুবাদ সম্পন্ন হতে সমস্যা হয়েছে।');
      }
    } catch {
      setStatusBanner('অনুবাদ সার্ভারে সংযোগ করা যায়নি।');
    } finally {
      setIsTranslating(false);
    }
  };

  // Load standard Hindi story template
  const handleLoadHindiPreset = (type: 'banaras' | 'animation_film') => {
    setFormLanguage('hi');
    if (type === 'animation_film') {
      setFormCategory('animation');
      setFormMediaType('video');
      setFormTitle('कालचक्र की दास्तान (एनीमेशन)');
      setFormSubtitle('बनारस की रहस्यमयी गलियों में 2D डार्क-फोक एनीमेशन');
      setFormGenre('लोकज एनीमेशन थ्रिलर');
      setFormSynopsis('अस्सी घाट की गहराइयों में छुपी एक प्राचीन घड़ी और समय के चक्र में उलझे एक मूर्तिकार की सिनेमाई एनीमेशन गाथा।');
      setFormWriter('विक्रम आदित्य');
      setFormNarrator('अनुपम खेर दल');
      setFormCoverArt('hi_cover_train');
      setTrailerVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
      setEpisodes([
        {
          id: 'ep-1',
          title: 'अध्याय 1: रहस्यमयी घड़ी',
          durationLabel: '12:40',
          synopsis: 'रात के तीसरे पहर अचानक प्राचीन घड़ी की सुइयां उल्टी चलने लगती हैं।',
          mediaType: 'video',
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        },
      ]);
    } else {
      setFormCategory('audio');
      setFormMediaType('audio');
      setFormTitle('पुरानी हवेली की दास्तान');
      setFormSubtitle('देवदार के जंगलों में सुनसान हवेली का अनसुना राज');
      setFormGenre('अलौकिक / हॉरर थ्रिलर');
      setFormSynopsis('शिमला के पास 1880 में बनी एक वीरान हवेली जहां हर अमावस्या को पियानो की धुन अपने आप बजने लगती है।');
      setFormWriter('रोहित मल्होत्रा');
      setFormNarrator('सुधीर पांडे');
      setFormCoverArt('hi_cover_haveli');
      setEpisodes([
        {
          id: 'ep-1',
          title: 'अध्याय 1: सुनसान राह',
          durationLabel: '15:20',
          synopsis: 'पहली बर्फबारी में हवेली का भारी लोहे का फाटक अपने आप खुल जाता है।',
          mediaType: 'audio',
        },
      ]);
    }
    setStatusBanner('হিন্দি স্টোরি টেমপ্লেট সফলভাবে লোড করা হয়েছে!');
  };

  // Save or update story
  const handleSaveStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) {
      setStatusBanner('এডমিন কি দিয়ে আগে আনলক করুন।');
      return;
    }
    setBusy(true);

    const parsedEpisodes = episodes.map((ep, idx) => ({
      id: ep.id || `${editingId || 'story'}-ep-${idx + 1}`,
      number: idx + 1,
      title: ep.title.trim() || `Episode ${idx + 1}`,
      durationLabel: ep.durationLabel.trim() || '14:00',
      durationSeconds: 75,
      audioKey: `${editingId || 'story'}_ep_${idx + 1}`,
      audioUrl: ep.audioUrl?.trim() || undefined,
      videoUrl: ep.videoUrl?.trim() || undefined,
      mediaType: ep.mediaType || formMediaType,
      synopsis: ep.synopsis.trim() || formSynopsis.slice(0, 140),
    }));

    const finalCoverArt = customArtworkUrl || formCoverArt;

    try {
      const res = await fetch('/api/admin/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          id: editingId || undefined,
          language: formLanguage,
          category: formCategory,
          mediaType: formMediaType,
          title: formTitle.trim(),
          subtitle: formSubtitle.trim(),
          genre: formGenre.trim(),
          synopsis: formSynopsis.trim(),
          writer: formWriter.trim() || 'Goppo Kahini Studio',
          narrator: formNarrator.trim() || 'Goppo Kahini Ensemble',
          coverArt: finalCoverArt,
          heroArt: finalCoverArt,
          trailerTitle: formLanguage === 'hi' ? `ट्रेलर — ${formTitle.trim()}` : `ট্রেলার — ${formTitle.trim()}`,
          trailerDurationLabel: '00:45',
          trailerDurationSeconds: 40,
          trailerAudioUrl: trailerAudioUrl.trim() || undefined,
          trailerVideoUrl: trailerVideoUrl.trim() || undefined,
          totalDurationLabel: formDuration.trim() || '20m',
          ticketPriceInr: formPrice,
          accessPolicy: formAccessPolicy,
          publicationStatus: formPubStatus,
          isFeaturedHero: formIsFeaturedHero,
          episodes: parsedEpisodes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStories(data.stories);
        onCatalogUpdated({ stories: data.stories, categories: data.categories });
        const targetTitle = formTitle.trim();
        const savedStory = (data.stories as StoryItem[]).find((s) =>
          editingId ? s.id === editingId : s.title === targetTitle && s.language === formLanguage,
        );
        if (savedStory) {
          void syncStoryToFirestore(savedStory).catch(() => {});
        }
        setStatusBanner('গল্প সফলভাবে সংরক্ষিত ও Firebase/ক্যাটালগে যুক্ত হয়েছে!');
        resetForm();
        setActiveTab('catalog');
      } else {
        const data = await res.json();
        setStatusBanner(data.error || 'সংরক্ষণ ব্যর্থ হয়েছে।');
      }
    } catch {
      setStatusBanner('নেটওয়ার্ক ত্রুটি ঘটেছে।');
    } finally {
      setBusy(false);
    }
  };

  // Delete story
  const handleDeleteStory = async (storyId: string) => {
    if (!authToken) return;
    if (!window.confirm('আপনি কি নিশ্চিত যে এই গল্পটি স্থায়ীভাবে মুছে ফেলতে চান?')) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/stories/${storyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories);
        onCatalogUpdated({ stories: data.stories, categories: data.categories });
        void deleteStoryFromFirestore(storyId).catch(() => {});
        setStatusBanner('গল্পটি সার্ভার ও Firestore থেকে মুছে ফেলা হয়েছে।');
      }
    } catch {
      setStatusBanner('গল্প মুছে ফেলা সম্ভব হয়নি।');
    } finally {
      setBusy(false);
    }
  };

  // Set story as featured hero in top box (Requires manage_hero)
  const handleSetHeroStory = async (storyId: string) => {
    if (!authToken || !hasPermission('manage_hero')) {
      setStatusBanner('হিরো বক্স পরিবর্তন করার অনুমতি নেই।');
      return;
    }
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
        onCatalogUpdated({ stories: data.stories, categories });
        const heroStory = (data.stories as StoryItem[]).find((s) => s.id === storyId);
        if (heroStory) {
          const sameLang = (data.stories as StoryItem[]).filter(
            (s) => s.language === heroStory.language,
          );
          for (const st of sameLang) {
            void syncStoryToFirestore(st).catch(() => {});
          }
        }
        setStatusBanner('নির্বাচিত গল্পটি এখন ফ্রন্ট এন্ডের শীর্ষ হিরো বক্সে লাইভ চলছে!');
      } else {
        const data = await res.json().catch(() => ({}));
        setStatusBanner(data.error || 'হিরো গল্প নির্ধারণে অনুমতি নেই।');
      }
    } catch {
      setStatusBanner('হিরো গল্প নির্ধারণে ত্রুটি হয়েছে।');
    }
  };

  // Toggle Category visibility
  const handleToggleCategory = async (categoryId: ContentCategory, nextEnabled: boolean) => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ categoryId, enabled: nextEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        onCatalogUpdated({ stories, categories: data.categories });
        void syncCategoryToFirestore(categoryId, nextEnabled).catch(() => {});
        setStatusBanner(`ক্যাটাগরি "${categoryId}" আপডেট করা হয়েছে।`);
      }
    } catch {
      setStatusBanner('ক্যাটাগরি আপডেট ব্যর্থ হয়েছে।');
    }
  };

  // Update N Pass Price
  const handleUpdateNPassPrice = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ nPassMonthlyPriceInr: customNPassPrice }),
      });
      if (res.ok) {
        void syncPlatformSettingToFirestore(customNPassPrice).catch(() => {});
        setStatusBanner(`প্ল্যাটফর্ম মূল্য ₹${customNPassPrice} সফলভাবে সংরক্ষণ ও সিঙ্ক হয়েছে!`);
      }
    } catch {
      setStatusBanner('মূল্য আপডেট ব্যর্থ হয়েছে।');
    }
  };

  // Upload Media Helper: Uploads directly to Firebase Storage Bucket when available, with server fallback
  const uploadMediaWithFirebaseFallback = async (
    file: File,
    folder: 'audio' | 'video' | 'artwork',
    mediaType: 'audio' | 'video' | 'image',
  ): Promise<{ url: string; viaCloudBucket: boolean }> => {
    if (isFirebaseStorageConfigured && auth?.currentUser) {
      try {
        setUploadProgress(5);
        const uploaded = await uploadMediaFileToFirebaseStorage(file, folder, (pct) =>
          setUploadProgress(pct),
        );
        return { url: uploaded.url, viaCloudBucket: true };
      } catch {
        // Bucket may not exist yet in Firebase Console; seamlessly fall back to server upload
      }
    }

    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('READ_FAILED'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/admin/upload-media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName: file.name,
        mediaType,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Upload failed');
    }
    return { url: data.url as string, viaCloudBucket: false };
  };

  // Upload Audio File
  const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'trailer' | number) => {
    const file = e.target.files?.[0];
    if (!file || !authToken) return;
    setBusy(true);
    setStatusBanner(`অডিও ফাইল "${file.name}" আপলোড হচ্ছে...`);

    try {
      const { url, viaCloudBucket } = await uploadMediaWithFirebaseFallback(file, 'audio', 'audio');
      if (target === 'trailer') {
        setTrailerAudioUrl(url);
      } else {
        setEpisodes((prev) =>
          prev.map((ep, idx) => (idx === target ? { ...ep, audioUrl: url } : ep)),
        );
      }
      setStatusBanner(
        viaCloudBucket
          ? `অডিও ফাইল "${file.name}" Firebase Storage বাকেটে সফলভাবে আপলোড হয়েছে!`
          : `অডিও ফাইল "${file.name}" সার্ভার স্টোরেজে সফলভাবে যুক্ত হয়েছে!`,
      );
    } catch {
      setStatusBanner('অডিও ফাইল আপলোড করতে সমস্যা হয়েছে।');
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  };

  // Upload Custom Artwork Poster
  const handleArtworkFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !authToken) return;
    setBusy(true);
    setStatusBanner(`পোস্টার "${file.name}" আপলোড হচ্ছে...`);

    try {
      const { url, viaCloudBucket } = await uploadMediaWithFirebaseFallback(file, 'artwork', 'image');
      setCustomArtworkUrl(url);
      setStatusBanner(
        viaCloudBucket
          ? 'কাস্টম পোস্টার Firebase Storage বাকেটে আপলোড সম্পন্ন হয়েছে!'
          : 'কাস্টম পোস্টার সার্ভার স্টোরেজে আপলোড সম্পন্ন হয়েছে!',
      );
    } catch {
      setStatusBanner('ছবি আপলোড করতে সমস্যা হয়েছে।');
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  };

  // Upload Video File (.mp4, .webm, .mov)
  const handleVideoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'trailer' | number) => {
    const file = e.target.files?.[0];
    if (!file || !authToken) return;
    setBusy(true);
    setStatusBanner(`ভিডিও ফাইল "${file.name}" আপলোড হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন।`);

    try {
      const { url, viaCloudBucket } = await uploadMediaWithFirebaseFallback(file, 'video', 'video');
      if (target === 'trailer') {
        setTrailerVideoUrl(url);
      } else {
        setEpisodes((prev) =>
          prev.map((ep, idx) =>
            idx === target ? { ...ep, videoUrl: url, mediaType: 'video' } : ep,
          ),
        );
      }
      setStatusBanner(
        viaCloudBucket
          ? `ভিডিও ফাইল "${file.name}" Firebase Storage বাকেটে সফলভাবে আপলোড হয়েছে!`
          : `ভিডিও ফাইল "${file.name}" সার্ভার স্টোরেজে সফলভাবে যুক্ত হয়েছে!`,
      );
    } catch {
      setStatusBanner('ভিডিও আপলোডে সমস্যা হয়েছে।');
    } finally {
      setUploadProgress(null);
      setBusy(false);
    }
  };

  // Live in-browser audio recording
  const startRecording = async (target: 'trailer' | number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        setRecorderTarget(target);

        // Upload recorded blob to backend
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          if (authToken) {
            const res = await fetch('/api/admin/upload-media', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                fileData: base64Data,
                fileName: `voice_record_${Date.now()}.webm`,
                mediaType: 'audio',
              }),
            });
            const data = await res.json();
            if (res.ok && data.url) {
              if (target === 'trailer') {
                setTrailerAudioUrl(data.url);
              } else {
                setEpisodes((prev) =>
                  prev.map((ep, idx) => (idx === target ? { ...ep, audioUrl: data.url } : ep)),
                );
              }
              setStatusBanner('রেকর্ড করা ভয়েস অডিও সফলভাবে যুক্ত হয়েছে!');
            }
          }
        };
        reader.readAsDataURL(audioBlob);

        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      alert('মাইক্রোফোন অ্যাক্সেস করতে সমস্যা হচ্ছে। অনুগ্রহ করে ব্রাউজারে মাইক্রোফোন অনুমতি দিন।');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  // Export JSON Catalog
  const handleExportJson = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/admin/export', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `goppo-kahini-catalog-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusBanner('সম্পূর্ণ ক্যাটালগ ব্যাকআপ ডাউনলোড সম্পন্ন হয়েছে!');
    } catch {
      setStatusBanner('ব্যাকআপ ডাউনলোডে ত্রুটি।');
    }
  };

  // Filtered stories
  const filteredStories = stories.filter((s) => {
    if (filterLang !== 'all' && s.language !== filterLang) return false;
    if (filterCategory !== 'all' && s.category !== filterCategory) return false;
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        s.writer.toLowerCase().includes(q) ||
        s.narrator.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Unauthorized / Signed-out Gate: Real Firebase Authentication Only (Zero hardcoded credentials or bypasses)
  if (!isAuthorizedStaff) {
    return (
      <div className="py-12 max-w-lg mx-auto px-4">
        <div className="rounded-2xl bg-gradient-to-b from-[#18131B] via-[#100D14] to-[#0A090C] border border-white/[0.08] p-6 sm:p-8 space-y-6 shadow-2xl shadow-black/80">
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-transparent border border-red-500/30 text-[#EF4444] mb-1">
              <Shield className="h-6 w-6" />
            </div>
            <h1 className="font-editorial text-2xl font-bold text-[#F5F2EB]">
              Goppo Kahini · সুরক্ষিত স্টুডিও লগইন
            </h1>
            <p className="text-xs sm:text-sm text-[#A69E95]">
              প্রশাসনিক স্টুডিও অ্যাক্সেস করতে অনুমোদিত Owner/Admin অথবা Editor Firebase অ্যাকাউন্ট দিয়ে সাইন ইন করুন।
            </p>
          </div>

          {user && !isAuthorizedStaff && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
              <p className="font-semibold">
                বর্তমান অ্যাকাউন্ট ({user.email}) অনুমোদিত স্টাফ নয়।
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (auth) {
                    await signOut(auth).catch(() => {});
                  }
                  if (onAdminLogout) onAdminLogout();
                }}
                className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold cursor-pointer"
              >
                অন্য অ্যাকাউন্টে লগইন করতে সাইন আউট করুন
              </button>
            </div>
          )}

          {!isFirebaseConfigured && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1.5">
              <p className="font-bold text-amber-300">Firebase সংযোগ বর্তমানে ডিসেবেল করা রয়েছে</p>
              <p>
                পূর্বের Firebase প্রোজেক্ট সংযোগ বিচ্ছিন্ন করা হয়েছে। আপনার নতুন Firebase প্রোজেক্ট কানেক্ট করার পর অ্যাডমিন ও এডিটর লগইন পুনরায় সক্রিয় হবে।
              </p>
            </div>
          )}

          {authError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 text-center">
              {authError}
            </div>
          )}

          <button
            type="button"
            disabled={busy || !isFirebaseConfigured}
            onClick={handleFirebaseGoogleLogin}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 font-semibold text-sm transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-3"
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
            <span>{busy ? 'যাচাই হচ্ছে...' : 'Google দিয়ে সাইন ইন করুন'}</span>
          </button>

          <div className="flex items-center gap-3 text-[11px] text-[#7D7670]">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span>অথবা ইমেইল ও পাসওয়ার্ড</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <form onSubmit={handleFirebaseEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#A69E95]">অনুমোদিত ইমেইল</label>
              <input
                type="email"
                required
                autoComplete="username"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="name@domain.com"
                className="w-full h-11 px-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#A69E95]">পাসওয়ার্ড</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !isFirebaseConfigured}
              className="w-full py-3 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-semibold text-[#F5F2EB] transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Key className="h-3.5 w-3.5 text-red-400" />
              <span>{busy ? 'যাচাই হচ্ছে...' : 'ইমেইল ও পাসওয়ার্ড দিয়ে প্রবেশ করুন'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const availableTabs: Array<{
    id: typeof activeTab;
    label: string;
    count?: number;
  }> = [
    ...(hasPermission('manage_stories') || hasPermission('manage_hero')
      ? [{ id: 'catalog' as const, label: '📚 কন্টেন্ট তালিকা ও পরিচালনা', count: stories.length }]
      : []),
    ...(hasPermission('manage_stories')
      ? [{ id: 'create_edit' as const, label: editingId ? '✏️ গল্প সম্পাদনা' : '✍️ নতুন গল্প যোগ করুন' }]
      : []),
    ...(hasPermission('manage_media')
      ? [{ id: 'audio_recorder' as const, label: '🎙️ ভয়েস রেকর্ডার ও অডিও আপলোড' }]
      : []),
    ...(isOwnerAdmin || hasPermission('manage_categories')
      ? [{ id: 'platform_settings' as const, label: '⚙️ ক্যাটাগরি ও প্ল্যাটফর্ম সেটিংস' }]
      : []),
    ...(isOwnerAdmin
      ? [
          { id: 'editors_rbac' as const, label: `👑 এডিটর ও রোল (${allEditors.length})` },
          { id: 'firebase_hub' as const, label: '🔥 ফায়ারবেস ব্যাকএন্ড হাব' },
          { id: 'users_orders' as const, label: `👥 কাস্টমার ডেটা ও অর্ডার (${allUsers.length})` },
        ]
      : []),
  ];

  const effectiveTab = availableTabs.some((t) => t.id === activeTab)
    ? activeTab
    : availableTabs[0]?.id || 'catalog';

  return (
    <div className="space-y-6 pb-16">
      {/* Top Banner / Breadcrumb Bar */}
      <div className="rounded-2xl bg-gradient-to-b from-[#18131B] via-[#120F16] to-[#0A090C] border border-white/[0.08] p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-[11px] font-semibold text-red-300">
              <Shield className="h-3 w-3" />
              {isOwnerAdmin ? 'Owner / Admin স্টুডিও' : 'Editor স্টুডিও (সীমিত অনুমতি)'}
            </span>
            <span className="text-xs text-[#A69E95] font-mono-num">{user?.email}</span>
          </div>
          <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#F5F2EB]">
            Goppo Kahini · কন্টেন্ট ও অডিও ম্যানেজমেন্ট
          </h1>
          <p className="text-xs sm:text-sm text-[#A69E95]">
            {isOwnerAdmin
              ? 'অডিও গল্প, লাইভ রেকর্ডিং, অ্যানিমেশন, ফিল্ম, এডিটর অনুমতি, কাস্টমার ডেটা ও সিস্টেম নিয়ন্ত্রণ কেন্দ্র।'
              : 'আপনার অনুমোদিত কন্টেন্ট, অডিও ও হিরো নির্বাচন পরিচালনা করুন।'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onSwitchToLiveSite && (
            <button
              type="button"
              onClick={onSwitchToLiveSite}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5 text-red-400" />
              <span>লাইভ সাইট দেখুন</span>
            </button>
          )}

          {isOwnerAdmin && (
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-red-400" />
              <span>ব্যাকআপ ডাউনলোড</span>
            </button>
          )}

          {onAdminLogout && (
            <button
              type="button"
              onClick={onAdminLogout}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-xs font-semibold text-red-300 cursor-pointer"
            >
              লগআউট
            </button>
          )}
        </div>
      </div>

      {statusBanner && (
        <div className="px-4 py-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs sm:text-sm text-red-200 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#EF4444] shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-red-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main RBAC Tab Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 border-b border-white/[0.06]">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
              effectiveTab === tab.id
                ? 'bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent border border-red-500/35 text-red-400 shadow-sm'
                : 'bg-white/[0.02] hover:bg-white/[0.06] text-[#A69E95] hover:text-[#F5F2EB] border border-white/[0.04]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="font-mono-num text-[11px] px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white/80">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: STORY CATALOG LIST & MANAGEMENT */}
      {effectiveTab === 'catalog' && (
        <div className="space-y-5">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#A69E95]">ভাষা:</span>
              {(['all', 'bn', 'hi'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setFilterLang(l)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    filterLang === l
                      ? 'bg-[#EF4444] text-white'
                      : 'bg-white/[0.04] text-[#A69E95] hover:text-[#F5F2EB]'
                  }`}
                >
                  {l === 'all' ? 'সব' : l === 'bn' ? 'বাংলা' : 'हिंदी'}
                </button>
              ))}

              <span className="text-xs text-[#A69E95] ml-2">বিভাগ:</span>
              {(['all', 'audio', 'animation', 'films'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterCategory(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                    filterCategory === c
                      ? 'bg-[#EF4444] text-white'
                      : 'bg-white/[0.04] text-[#A69E95] hover:text-[#F5F2EB]'
                  }`}
                >
                  {c === 'all'
                    ? 'সব'
                    : c === 'audio'
                    ? 'অডিও গল্প'
                    : c === 'animation'
                    ? 'অ্যানিমেশন'
                    : 'ফিল্ম'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 min-w-0 sm:w-64">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A69E95]" />
                <input
                  type="text"
                  placeholder="গল্প বা লেখক খুঁজুন..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 rounded-lg bg-[#0B090E] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setActiveTab('create_edit');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-[#DC2626] to-[#EF4444] text-white text-xs font-semibold shrink-0 cursor-pointer shadow-md shadow-red-950/30"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>নতুন গল্প</span>
              </button>
            </div>
          </div>

          {/* Stories List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStories.map((story) => (
              <div
                key={story.id}
                className="p-4 rounded-2xl bg-gradient-to-b from-[#16131A] to-[#0E0C12] border border-white/[0.06] flex gap-4 hover:border-red-500/30 transition-all shadow-md"
              >
                <div className="w-20 aspect-[3/4] rounded-xl overflow-hidden shrink-0 border border-white/[0.08] bg-[#0A090C] relative">
                  <ArtworkImage
                    srcKeyOrUrl={story.coverArt}
                    alt={story.title}
                    className="h-full w-full object-cover"
                  />
                  {story.isFeaturedHero && (
                    <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-[#EF4444] flex items-center justify-center text-white shadow-md">
                      <Star className="h-3 w-3 fill-current" />
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.06] text-[#A69E95]">
                        {story.language === 'bn' ? 'বাংলা' : 'हिंदी'} · {story.category}
                      </span>
                      {story.isFeaturedHero && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                          হিরো বক্সে লাইভ
                        </span>
                      )}
                      <span className="text-[10px] text-red-400 font-mono-num font-bold">
                        ₹{story.ticketPriceInr}
                      </span>
                    </div>

                    <h3 className="font-editorial text-base font-bold text-[#F5F2EB] truncate">
                      {story.title}
                    </h3>
                    <p className="text-xs text-[#A69E95] truncate">
                      {story.genre} · {story.episodes.length} পর্ব · {story.totalDurationLabel}
                    </p>
                    <p className="text-xs text-[#7D7670] truncate">
                      কথক: {story.narrator} · লেখক: {story.writer}
                    </p>
                  </div>

                  {/* Actions Bar (Permission-gated UI + Server Enforced) */}
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    {hasPermission('manage_hero') && (
                      <button
                        type="button"
                        onClick={() => handleSetHeroStory(story.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          story.isFeaturedHero
                            ? 'bg-[#EF4444] text-white shadow-sm'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#A69E95] hover:text-[#F5F2EB] border border-white/[0.06]'
                        }`}
                      >
                        <Star className="h-3 w-3" />
                        <span>{story.isFeaturedHero ? 'হিরো বক্সে সেট' : 'হিরো বক্সে নিন'}</span>
                      </button>
                    )}

                    {hasPermission('manage_stories') && (
                      <>
                        <button
                          type="button"
                          onClick={() => loadIntoForm(story)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-semibold text-red-400 cursor-pointer"
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>এডিট</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteStory(story.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 hover:text-red-300 border border-red-500/20 cursor-pointer ml-auto"
                          title="মুছে ফেলুন"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: CREATE / EDIT STORY WITH AUDIO UPLOAD & RECORDING */}
      {effectiveTab === 'create_edit' && hasPermission('manage_stories') && (
        <form onSubmit={handleSaveStory} className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div>
                <h2 className="font-editorial text-xl font-bold text-[#F5F2EB]">
                  {editingId ? `গল্প সম্পাদনা: ${formTitle || editingId}` : 'নতুন কন্টেন্ট প্রকাশ ও অডিও আপলোড'}
                </h2>
                <p className="text-xs text-[#A69E95]">
                  এখানে তথ্য পূরণ করে সেভ করলেই গল্পটি স্বয়ংক্রিয়ভাবে অডিও গল্প ও নতুন গল্পের সবার প্রথমে চলে আসবে।
                </p>
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-red-400 cursor-pointer"
                >
                  + নতুন গল্প তৈরি করুন
                </button>
              )}
            </div>

            {/* Language Selection & 1-Click Auto Hindi Conversion */}
            <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#F5F2EB]">ভাষা নির্বাচন ও অটো-কনভার্ট (Language & Conversion)</label>
                  <p className="text-[11px] text-[#A69E95]">
                    হিন্দি নির্বাচন করলে ১-ক্লিকে বাংলা গল্পকে সম্পূর্ণ স্বয়ংক্রিয় সিনেম্যাটিক হিন্দিতে রূপান্তর করতে পারেন।
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormLanguage('bn');
                      if (formCoverArt.startsWith('hi_')) setFormCoverArt('bn_cover_salbon');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                      formLanguage === 'bn'
                        ? 'bg-[#EF4444] border-[#EF4444] text-white shadow-md'
                        : 'bg-white/[0.02] border-white/[0.08] text-[#A69E95] hover:text-white'
                    }`}
                  >
                    বাংলা (Bengali)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormLanguage('hi');
                      if (formCoverArt.startsWith('bn_')) setFormCoverArt('hi_cover_haveli');
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                      formLanguage === 'hi'
                        ? 'bg-[#EF4444] border-[#EF4444] text-white shadow-md'
                        : 'bg-white/[0.02] border-white/[0.08] text-[#A69E95] hover:text-white'
                    }`}
                  >
                    हिंदी (Hindi)
                  </button>
                </div>
              </div>

              {/* Hindi Auto-Conversion & Template Bar */}
              <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-white/[0.04]">
                {hasPermission('translate_stories') && (
                  <button
                    type="button"
                    disabled={isTranslating}
                    onClick={handleTranslateToHindi}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-600/30 to-red-500/20 hover:from-red-600/40 hover:to-red-500/30 border border-red-500/40 text-xs font-semibold text-red-200 cursor-pointer shadow-sm transition-all disabled:opacity-50"
                    title="বর্তমান বাংলা গল্পটিকে সম্পূর্ণ নির্ভুল ও সিনেম্যাটিক হিন্দিতে অনুবাদ করে ফর্ম পূরণ করবে"
                  >
                    {isTranslating ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-red-400" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5 text-red-400" />
                    )}
                    <span>{isTranslating ? 'হিন্দিতে অনুবাদ হচ্ছে...' : '✨ স্বয়ংক্রিয় হিন্দিতে রূপান্তর করুন (Auto Translate to Hindi)'}</span>
                  </button>
                )}

                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[11px] text-[#7D7670]">হিন্দি টেমপ্লেট:</span>
                  <button
                    type="button"
                    onClick={() => handleLoadHindiPreset('banaras')}
                    className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-[#A69E95] hover:text-[#F5F2EB] border border-white/[0.06] cursor-pointer"
                  >
                    🏰 हवेली थ्रिलर
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadHindiPreset('animation_film')}
                    className="px-2.5 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-red-400 hover:text-red-300 border border-red-500/20 cursor-pointer"
                  >
                    🎬 कालचक्र एनीमेशन
                  </button>
                </div>
              </div>
            </div>

            {/* Core Categories & Media Type (Audio vs Video) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">মূল বিভাগ (3 Core Categories)</label>
                <select
                  value={formCategory}
                  onChange={(e) => {
                    const nextCat = e.target.value as ContentCategory;
                    setFormCategory(nextCat);
                    if (nextCat === 'animation' || nextCat === 'films') {
                      setFormMediaType('video');
                    } else {
                      setFormMediaType('audio');
                    }
                  }}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                >
                  <option value="audio">অডিও গল্প (Audio Stories - Newest Updates First)</option>
                  <option value="animation">অ্যানিমেশন (Animation - Video & Audio)</option>
                  <option value="films">ফিল্ম (Films - Video & Audio)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">
                  মিডিয়া মোড (Media Content Type)
                </label>
                <div className="flex items-center gap-2 h-11">
                  <button
                    type="button"
                    onClick={() => setFormMediaType('video')}
                    className={`flex-1 h-full rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      formMediaType === 'video'
                        ? 'bg-red-500/20 border-[#EF4444] text-red-300 shadow-md'
                        : 'bg-white/[0.02] border-white/[0.08] text-[#A69E95] hover:text-[#F5F2EB]'
                    }`}
                  >
                    <Video className="h-3.5 w-3.5 text-[#EF4444]" />
                    <span>ভিডিও কন্টেন্ট (.mp4 / .webm)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMediaType('audio')}
                    className={`flex-1 h-full rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      formMediaType === 'audio'
                        ? 'bg-red-500/20 border-[#EF4444] text-red-300 shadow-md'
                        : 'bg-white/[0.02] border-white/[0.08] text-[#A69E95] hover:text-[#F5F2EB]'
                    }`}
                  >
                    <Music className="h-3.5 w-3.5 text-[#EF4444]" />
                    <span>অডিও MP3 / WAV</span>
                  </button>
                </div>
              </div>

              {(formCategory === 'animation' || formCategory === 'films') && (
                <div className="sm:col-span-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
                  <Film className="h-4 w-4 text-[#EF4444] shrink-0" />
                  <span>
                    <strong>{formCategory === 'animation' ? 'অ্যানিমেশন' : 'ফিল্ম'} মোড সক্রিয়:</strong> আপনি ভিডিও ফাইল (.mp4 / .webm / .mov) সরাসরি আপলোড করতে পারবেন এবং ওয়েবসাইটে ফুল ভিডিও প্লেয়ার সক্রিয় হবে।
                  </span>
                </div>
              )}
            </div>

            {/* Titles & Genre */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-xs font-semibold text-[#F5F2EB]">
                  {formLanguage === 'hi' ? 'कहानी का शीर्षक (Title) *' : 'গল্পের শিরোনাম (Title) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formLanguage === 'hi'
                      ? 'जैसे: पुरानी हवेली की दास्तान, कालचक्र की रहस्यमयी घड़ी...'
                      : 'যেমন: কুয়াশার ডাক, নীল পদ্মের রহস্য...'
                  }
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">
                  {formLanguage === 'hi' ? 'विधा / जॉनर (Genre) *' : 'জনরা / ধরন (Genre) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formLanguage === 'hi'
                      ? 'जैसे: रहस्य-रोमांच, अलौकिक / हॉरर, जासूसी...'
                      : 'যেমন: রহস্য-রোমাঞ্চ, ভৌতিক, গোয়েন্দা...'
                  }
                  value={formGenre}
                  onChange={(e) => setFormGenre(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">
                  {formLanguage === 'hi' ? 'उपशीर्षक (Subtitle)' : 'উপশিরোনাম (Subtitle)'}
                </label>
                <input
                  type="text"
                  placeholder={
                    formLanguage === 'hi'
                      ? 'जैसे: देवदार के जंगलों में सुनसान हवेली का अनसुना राज'
                      : 'যেমন: একটি অতিপ্রাকৃতিক গা ছমছমে রহস্য কাহিনী'
                  }
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#F5F2EB]">
                    {formLanguage === 'hi' ? 'लेखक (Writer)' : 'লেখক (Writer)'}
                  </label>
                  <input
                    type="text"
                    value={formWriter}
                    onChange={(e) => setFormWriter(e.target.value)}
                    placeholder={formLanguage === 'hi' ? 'लेखक का नाम' : 'লেখকের নাম'}
                    className="w-full h-11 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#F5F2EB]">
                    {formLanguage === 'hi' ? 'कथावाचक (Narrator)' : 'কণ্ঠশিল্পী (Narrator)'}
                  </label>
                  <input
                    type="text"
                    value={formNarrator}
                    onChange={(e) => setFormNarrator(e.target.value)}
                    placeholder={formLanguage === 'hi' ? 'कथावाचक का नाम' : 'কথকের নাম'}
                    className="w-full h-11 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                  />
                </div>
              </div>
            </div>

            {/* Synopsis */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#F5F2EB]">
                {formLanguage === 'hi' ? 'सारांश (Synopsis)' : 'সারসংক্ষেপ (Synopsis)'}
              </label>
              <textarea
                rows={3}
                placeholder={
                  formLanguage === 'hi'
                    ? 'कहानी का मुख्य कथानक और रोमांचक विवरण लिखें...'
                    : 'গল্পের মূল প্লট ও আকর্ষণীয় বর্ণনা লিখুন...'
                }
                value={formSynopsis}
                onChange={(e) => setFormSynopsis(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
              />
            </div>

            {/* Pricing, Access Policy & Hero Feature */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">টিকিট মূল্য (₹ Inr)</label>
                <input
                  type="number"
                  min={1}
                  value={formPrice}
                  onChange={(e) => setFormPrice(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm font-mono-num text-[#EF4444] font-bold focus:outline-none focus:border-[#EF4444]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">অ্যাক্সেস পলিসি</label>
                <select
                  value={formAccessPolicy}
                  onChange={(e) => setFormAccessPolicy(e.target.value as AccessPolicy)}
                  className="w-full h-10 px-2 rounded-xl bg-[#09080B] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                >
                  <option value="both">N Pass + টিকিট দুটোই</option>
                  <option value="ticket_only">শুধুমাত্র টিকিট কাটতে হবে</option>
                  <option value="npass_included">N Pass থাকলে ফ্রি</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">প্রকাশ অবস্থা</label>
                <select
                  value={formPubStatus}
                  onChange={(e) => setFormPubStatus(e.target.value as PublicationStatus)}
                  className="w-full h-10 px-2 rounded-xl bg-[#09080B] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                >
                  <option value="published">লাইভ প্রকাশিত (Published)</option>
                  <option value="draft">ড্রাফট (Unpublished Draft)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#F5F2EB]">মোট সময়কাল</label>
                <input
                  type="text"
                  placeholder="যেমন: 28m, 1h 15m"
                  value={formDuration}
                  onChange={(e) => setFormDuration(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-sm text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
              </div>

              {hasPermission('manage_hero') && (
                <div className="sm:col-span-4 pt-2">
                  <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${formIsFeaturedHero ? 'bg-red-950/30 border-red-500/50' : 'bg-white/[0.03] border-white/[0.08]'}`}>
                    <div>
                      <h4 className="text-sm font-bold text-[#F5F2EB]">হোমপেজ হিরো বক্স (চলছে)</h4>
                      <p className="text-xs text-[#A69E95]">এটি অন করলে এই গল্পটি সবার প্রথমে হোমপেজের বড় ব্যানার বা "চলছে" সেকশনে দেখা যাবে।</p>
                    </div>
                    <label className="inline-flex items-center cursor-pointer relative">
                      <input
                        type="checkbox"
                        checked={formIsFeaturedHero}
                        onChange={(e) => setFormIsFeaturedHero(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/[0.1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EF4444]"></div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Artwork Cover Section */}
            <div className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#F5F2EB]">কভার পোস্টার / আর্টওয়ার্ক</label>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-[#F5F2EB] cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-red-400" />
                  <span>নিজের ছবি আপলোড করুন</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleArtworkFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <select
                  value={formCoverArt}
                  onChange={(e) => {
                    setFormCoverArt(e.target.value);
                    setCustomArtworkUrl(null);
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                >
                  {ARTWORK_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-3">
                  <div className="h-14 w-12 rounded-lg overflow-hidden border border-white/[0.08] bg-[#0A090C] shrink-0">
                    <ArtworkImage
                      srcKeyOrUrl={customArtworkUrl || formCoverArt}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="text-xs text-[#A69E95]">
                    {customArtworkUrl ? 'কাস্টম আপলোড করা পোস্টার সক্রিয় রয়েছে' : 'প্রিসেট ছবি নির্বাচিত রয়েছে'}
                  </span>
                </div>
              </div>
            </div>

            {/* Trailer Media Section: Video & Audio Options */}
            <div className="p-4 rounded-xl bg-gradient-to-b from-[#1C1217] to-[#120B0E] border border-red-500/25 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-editorial text-sm font-bold text-[#F5F2EB] flex items-center gap-2">
                    {formMediaType === 'video' ? (
                      <Video className="h-4 w-4 text-[#EF4444]" />
                    ) : (
                      <Music className="h-4 w-4 text-[#EF4444]" />
                    )}
                    {formMediaType === 'video' ? 'ফ্রি ট্রেলার ভিডিও ফাইল / লিঙ্ক' : 'ফ্রি ট্রেলার অডিও ফাইল / লাইভ ভয়েস রেকর্ড'}
                  </h3>
                  <p className="text-xs text-[#A69E95]">
                    {formMediaType === 'video'
                      ? 'শ্রোতা/দর্শকরা এই ট্রেলার ভিডিওটি সম্পূর্ণ ফ্রিতে দেখতে পারবেন।'
                      : 'শ্রোতারা কেনার আগে এই ট্রেলার অডিওটি সম্পূর্ণ ফ্রিতে শুনতে পারবেন।'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Video Upload for Trailer */}
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-xs font-semibold text-red-300 cursor-pointer">
                    <Video className="h-3.5 w-3.5 text-red-400" />
                    <span>ভিডিও ফাইল আপলোড (.mp4 / .webm)</span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/*"
                      onChange={(e) => handleVideoFileUpload(e, 'trailer')}
                      className="hidden"
                    />
                  </label>

                  {/* Audio Upload for Trailer */}
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-[#F5F2EB] cursor-pointer">
                    <Upload className="h-3.5 w-3.5 text-red-400" />
                    <span>অডিও (.mp3)</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => handleAudioFileUpload(e, 'trailer')}
                      className="hidden"
                    />
                  </label>

                  {/* Mic Record Button */}
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={() => startRecording('trailer')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-red-300 cursor-pointer"
                    >
                      <Mic className="h-3.5 w-3.5 text-red-400" />
                      <span>ভয়েস রেকর্ড</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold animate-pulse cursor-pointer"
                    >
                      <MicOff className="h-3.5 w-3.5" />
                      <span>রেকর্ডিং থামান ({recordingSeconds}s)</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Direct Video URL Input for Trailer */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#A69E95]">
                  সরাসরি ট্রেলার ভিডিও লিঙ্ক / MP4 URL (ঐচ্ছিক):
                </label>
                <input
                  type="text"
                  placeholder="যেমন: https://.../trailer.mp4 বা /api/uploads/video.mp4"
                  value={trailerVideoUrl}
                  onChange={(e) => setTrailerVideoUrl(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-[#09080B] border border-white/[0.08] text-xs font-mono text-red-300 focus:outline-none focus:border-[#EF4444]"
                />
              </div>

              {/* Live Video Preview for Trailer */}
              {trailerVideoUrl && (
                <div className="p-3 rounded-lg bg-black/60 border border-red-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs text-red-300">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5" />
                      ট্রেলার ভিডিও প্রিভিউ
                    </span>
                    <button
                      type="button"
                      onClick={() => setTrailerVideoUrl('')}
                      className="text-red-400 hover:text-white text-[11px]"
                    >
                      ভিডিও সরান
                    </button>
                  </div>
                  <video
                    controls
                    playsInline
                    src={trailerVideoUrl}
                    className="w-full max-h-56 rounded-lg bg-black border border-white/[0.06] object-contain"
                  />
                </div>
              )}

              {/* Audio Preview for Trailer */}
              {trailerAudioUrl && (
                <div className="p-3 rounded-lg bg-black/40 border border-red-500/20 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Volume2 className="h-4 w-4 text-red-400 shrink-0" />
                    <span className="font-mono text-red-300 truncate">{trailerAudioUrl}</span>
                  </div>
                  <audio controls src={trailerAudioUrl} className="h-7 w-48 shrink-0" />
                </div>
              )}
            </div>

            {/* Dynamic Episodes Editor: Video & Audio Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-editorial text-sm font-bold text-[#F5F2EB]">
                    {formLanguage === 'hi' ? 'कहानी के अध्याय (Episodes List)' : 'গল্পের পর্বসমূহ (Episodes List)'} — {episodes.length}
                  </h3>
                  <p className="text-xs text-[#A69E95]">
                    {formMediaType === 'video'
                      ? 'প্রতিটি পর্বের জন্য ভিডিও ফাইল (.mp4) আপলোড বা ভিডিও লিঙ্ক এবং অডিও যুক্ত করতে পারেন।'
                      : 'প্রতিটি পর্বের অডিও ফাইল আপলোড বা সরাসরি রেকর্ড করে যুক্ত করতে পারেন।'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setEpisodes((prev) => [
                      ...prev,
                      {
                        id: `ep-${prev.length + 1}`,
                        title: formLanguage === 'hi' ? `अध्याय ${prev.length + 1}` : `পর্ব ${prev.length + 1}`,
                        durationLabel: '15:00',
                        synopsis: '',
                        mediaType: formMediaType,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-red-400 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ নতুন পর্ব যোগ করুন</span>
                </button>
              </div>

              <div className="space-y-3">
                {episodes.map((ep, idx) => (
                  <div
                    key={ep.id}
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-1 text-xs font-mono-num font-bold text-red-400">
                        #{idx + 1}
                      </div>

                      <div className="sm:col-span-6">
                        <input
                          type="text"
                          placeholder={formLanguage === 'hi' ? 'अध्याय का शीर्षक...' : 'পর্বের নাম...'}
                          value={ep.title}
                          onChange={(e) =>
                            setEpisodes((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item)),
                            )
                          }
                          className="w-full h-9 px-3 rounded-lg bg-[#09080B] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          placeholder="সময়কাল (14:30)"
                          value={ep.durationLabel}
                          onChange={(e) =>
                            setEpisodes((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, durationLabel: e.target.value } : item,
                              ),
                            )
                          }
                          className="w-full h-9 px-2.5 rounded-lg bg-[#09080B] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                        />
                      </div>

                      <div className="sm:col-span-3 flex items-center gap-1.5 justify-end">
                        {/* Video upload button for episode */}
                        <label
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs text-red-400 border border-red-500/20 cursor-pointer"
                          title="পর্বের ভিডিও ফাইল আপলোড (.mp4 / .webm)"
                        >
                          <Video className="h-4 w-4" />
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/*"
                            onChange={(e) => handleVideoFileUpload(e, idx)}
                            className="hidden"
                          />
                        </label>

                        {/* Audio file upload for episode */}
                        <label className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-xs text-red-400 cursor-pointer" title="অডিও ফাইল আপলোড">
                          <Upload className="h-4 w-4" />
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) => handleAudioFileUpload(e, idx)}
                            className="hidden"
                          />
                        </label>

                        {/* Mic record for episode */}
                        <button
                          type="button"
                          onClick={() => (!isRecording ? startRecording(idx) : stopRecording())}
                          className={`p-1.5 rounded-lg text-xs cursor-pointer ${
                            isRecording && recorderTarget === idx
                              ? 'bg-red-600 text-white animate-pulse'
                              : 'bg-white/[0.04] hover:bg-white/[0.08] text-red-400'
                          }`}
                          title="ভয়েস রেকর্ড করুন"
                        >
                          <Mic className="h-4 w-4" />
                        </button>

                        {episodes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setEpisodes((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 cursor-pointer"
                            title="মুছে ফেলুন"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Optional Episode Video URL / File Upload */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center pt-1 border-t border-white/[0.04]">
                      <span className="sm:col-span-3 text-[11px] font-semibold text-red-400 flex items-center gap-1">
                        <Video className="h-3.5 w-3.5" />
                        <span>ভিডিও ফাইল বা লিঙ্ক:</span>
                      </span>
                      <div className="sm:col-span-9 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="https://.../episode.mp4 বা সরাসরি ভিডিও আপলোড করুন"
                          value={ep.videoUrl || ''}
                          onChange={(e) =>
                            setEpisodes((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, videoUrl: e.target.value, mediaType: e.target.value ? 'video' : item.mediaType } : item,
                              ),
                            )
                          }
                          className="w-full h-8 px-2.5 rounded-lg bg-[#09080B] border border-white/[0.08] text-xs font-mono text-red-300 focus:outline-none focus:border-[#EF4444]"
                        />
                        <label className="px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-[11px] font-semibold text-red-200 shrink-0 cursor-pointer flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          <span>আপলোড (.mp4)</span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/*"
                            onChange={(e) => handleVideoFileUpload(e, idx)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Optional Episode Audio URL / File Upload */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <span className="sm:col-span-3 text-[11px] font-semibold text-[#A69E95] flex items-center gap-1">
                        <Music className="h-3.5 w-3.5" />
                        <span>অডিও ফাইল বা লিঙ্ক:</span>
                      </span>
                      <div className="sm:col-span-9 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="https://.../audio.mp3 বা অডিও আপলোড করুন"
                          value={ep.audioUrl || ''}
                          onChange={(e) =>
                            setEpisodes((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, audioUrl: e.target.value } : item,
                              ),
                            )
                          }
                          className="w-full h-8 px-2.5 rounded-lg bg-[#09080B] border border-white/[0.08] text-xs font-mono text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                        />
                        <label className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-semibold text-[#F5F2EB] shrink-0 cursor-pointer flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          <span>আপলোড (.mp3)</span>
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={(e) => handleAudioFileUpload(e, idx)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Previews */}
                    {ep.videoUrl && (
                      <div className="p-2.5 rounded-lg bg-black/50 border border-red-500/30 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-red-300">
                          <span className="font-semibold flex items-center gap-1">
                            <Video className="h-3.5 w-3.5" />
                            পর্ব #{idx + 1} ভিডিও সক্রিয় রয়েছে
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEpisodes((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, videoUrl: undefined } : item)),
                              )
                            }
                            className="text-red-400 hover:text-white text-[10px]"
                          >
                            সরান
                          </button>
                        </div>
                        <video controls playsInline src={ep.videoUrl} className="w-full max-h-44 rounded bg-black object-contain" />
                      </div>
                    )}

                    {ep.audioUrl && (
                      <div className="p-2.5 rounded bg-black/40 border border-white/[0.06] flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Music className="h-4 w-4 text-red-400 shrink-0" />
                          <span className="font-mono text-red-300 truncate">{ep.audioUrl}</span>
                        </div>
                        <audio controls src={ep.audioUrl} className="h-6 w-44 shrink-0" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-bold text-sm transition-all shadow-xl shadow-red-950/40 cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              <span>{editingId ? 'পরিবর্তন সংরক্ষণ করুন' : 'নতুন গল্প প্রকাশ করুন (সবার প্রথমে যুক্ত হবে)'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: STANDALONE LIVE AUDIO RECORDER LAB */}
      {effectiveTab === 'audio_recorder' && hasPermission('manage_media') && (
        <div className="p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-6">
          <div>
            <h2 className="font-editorial text-xl font-bold text-[#F5F2EB] flex items-center gap-2">
              <Mic className="h-5 w-5 text-[#EF4444]" />
              লাইভ স্টোরি ভয়েস রেকর্ডার ল্যাব
            </h2>
            <p className="text-xs text-[#A69E95]">
              এখানে সরাসরি মাইক্রোফোনে গল্প বা ট্রেলার রেকর্ড করে শুনুন এবং যেকোনো গল্পে অডিও হিসেবে যুক্ত করুন।
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-gradient-to-b from-[#1C1216] to-[#120B0E] border border-red-500/25 flex flex-col items-center justify-center text-center space-y-5">
            <div
              className={`h-24 w-24 rounded-full flex items-center justify-center border-2 transition-all ${
                isRecording
                  ? 'border-red-500 bg-red-500/20 shadow-lg shadow-red-500/40 animate-pulse'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <Mic className={`h-10 w-10 ${isRecording ? 'text-red-400' : 'text-[#A69E95]'}`} />
            </div>

            <div className="space-y-1">
              <p className="font-mono-num text-3xl font-bold text-[#F5F2EB]">
                {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
                {String(recordingSeconds % 60).padStart(2, '0')}
              </p>
              <p className="text-xs text-[#A69E95]">
                {isRecording ? 'ভয়েস রেকর্ড হচ্ছে... স্পষ্ট করে বলুন' : 'রেকর্ডিং শুরু করতে নিচের বোতামে চাপুন'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={() => startRecording('trailer')}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#EF4444] text-white font-bold text-sm cursor-pointer shadow-lg shadow-red-950/40 flex items-center gap-2"
                >
                  <Mic className="h-4 w-4" />
                  <span>রেকর্ডিং শুরু করুন</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-6 py-3 rounded-xl bg-white text-[#09080B] font-bold text-sm cursor-pointer shadow-lg animate-pulse flex items-center gap-2"
                >
                  <MicOff className="h-4 w-4" />
                  <span>রেকর্ডিং থামান ও সেভ করুন</span>
                </button>
              )}
            </div>

            {recordedAudioUrl && (
              <div className="w-full max-w-md pt-4 border-t border-white/[0.08] space-y-2">
                <p className="text-xs font-semibold text-red-400">সর্বশেষ রেকর্ড করা ট্র্যাক প্রিভিউ:</p>
                <audio controls src={recordedAudioUrl} className="w-full" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM CATEGORIES & OWNER-ONLY SETTINGS */}
      {effectiveTab === 'platform_settings' && (isOwnerAdmin || hasPermission('manage_categories')) && (
        <div className="space-y-6">
          {/* Categories Toggle Card */}
          {hasPermission('manage_categories') && (
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-4">
              <h2 className="font-editorial text-lg font-bold text-[#F5F2EB]">
                ৩টি মূল ক্যাটাগরি দৃশ্যমানতা (Core Categories Visibility)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#F5F2EB] capitalize">
                        {cat.id === 'audio'
                          ? 'অডিও গল্প'
                          : cat.id === 'animation'
                          ? 'অ্যানিমেশন'
                          : 'ফিল্ম'}
                      </p>
                      <p className="font-mono-num text-xs text-[#A69E95]">
                        বাংলা: {cat.publishedCountBn} · हिंदी: {cat.publishedCountHi}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat.id, !cat.enabledByAdmin)}
                      className="text-[#EF4444] cursor-pointer"
                    >
                      {cat.enabledByAdmin ? (
                        <ToggleRight className="h-8 w-8" />
                      ) : (
                        <ToggleLeft className="h-8 w-8 text-[#8C847C]" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Owner/Admin Only Settings */}
          {isOwnerAdmin && (
            <div className="p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-4">
              <h2 className="font-editorial text-lg font-bold text-[#F5F2EB]">
                প্ল্যাটফর্ম মূল্য সেটিংস (শুধুমাত্র Owner / Admin)
              </h2>
              <p className="text-xs text-[#A69E95]">
                লিগ্যাসি পাস বা প্ল্যাটফর্ম কনফিগারেশন মূল্য পরিবর্তন করুন (বর্তমান মান: ₹{customNPassPrice})।
              </p>

              <div className="flex items-center gap-3 max-w-sm">
                <span className="text-lg font-bold text-red-400">₹</span>
                <input
                  type="number"
                  min={1}
                  value={customNPassPrice}
                  onChange={(e) => setCustomNPassPrice(Number(e.target.value))}
                  className="w-32 h-11 px-3.5 rounded-xl bg-[#09080B] border border-white/[0.08] text-base font-mono-num font-bold text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
                <button
                  type="button"
                  onClick={handleUpdateNPassPrice}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#EF4444] text-white font-semibold text-xs cursor-pointer shadow-md shadow-red-950/30"
                >
                  আপডেট করুন
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: OWNER/ADMIN ONLY EDITOR & RBAC PERMISSION MANAGEMENT */}
      {effectiveTab === 'editors_rbac' && isOwnerAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveEditorGrant}
            className="lg:col-span-5 p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-4"
          >
            <div className="space-y-1 border-b border-white/[0.06] pb-3">
              <h2 className="font-editorial text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#EF4444]" />
                <span>নতুন এডিটর যোগ বা অনুমতি পরিবর্তন</span>
              </h2>
              <p className="text-xs text-[#A69E95]">
                এডিটররা কেবল আপনার নির্ধারিত কন্টেন্ট অনুমতি পাবেন — সেটিংস, পেমেন্ট বা ইউজার ডেটায় কোনো স্বয়ংক্রিয় অ্যাক্সেস থাকবে না।
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#A69E95]">এডিটরের ইমেইল *</label>
              <input
                type="email"
                required
                value={editorEmailInput}
                onChange={(e) => setEditorEmailInput(e.target.value)}
                placeholder="editor@domain.com"
                className="w-full h-10 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#A69E95]">নাম</label>
                <input
                  type="text"
                  value={editorNameInput}
                  onChange={(e) => setEditorNameInput(e.target.value)}
                  placeholder="এডিটরের নাম"
                  className="w-full h-10 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#A69E95]">Firebase UID (ঐচ্ছিক)</label>
                <input
                  type="text"
                  value={editorUidInput}
                  onChange={(e) => setEditorUidInput(e.target.value)}
                  placeholder="প্রথম লগইনে অটো-সিঙ্ক"
                  className="w-full h-10 px-3 rounded-xl bg-[#09080B] border border-white/[0.08] text-xs font-mono text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="block text-xs font-semibold text-[#F5F2EB]">
                নির্দিষ্ট এডিটর অনুমতি (Explicit Permissions)
              </label>
              <div className="space-y-2">
                {EDITOR_PERMISSION_LABELS.map((perm) => {
                  const checked = editorPermSelection.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-red-500/10 border-red-500/35'
                          : 'bg-white/[0.02] border-white/[0.06]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditorPermSelection((prev) => Array.from(new Set([...prev, perm.key])));
                          } else {
                            setEditorPermSelection((prev) => prev.filter((p) => p !== perm.key));
                          }
                        }}
                        className="mt-0.5 accent-[#EF4444] cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#F5F2EB]">{perm.label}</p>
                        <p className="text-[11px] text-[#9E968F]">{perm.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy || editorPermSelection.length === 0}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              এডিটর অ্যাক্সেস সংরক্ষণ করুন
            </button>
          </form>

          <div className="lg:col-span-7 p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-4">
            <h2 className="font-editorial text-lg font-bold text-[#F5F2EB] border-b border-white/[0.06] pb-3">
              সক্রিয় এডিটর তালিকা ({allEditors.length})
            </h2>
            {allEditors.length === 0 ? (
              <p className="text-xs text-[#A69E95] py-8 text-center">
                এখনো কোনো এডিটর যুক্ত করা হয়নি। বাম পাশের ফর্ম ব্যবহার করে অনুমোদিত এডিটর যোগ করুন।
              </p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {allEditors.map((ed) => (
                  <div key={ed.email} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#F5F2EB] truncate">{ed.name}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-300">
                          EDITOR
                        </span>
                      </div>
                      <p className="text-xs font-mono text-[#C8BFB5] truncate">{ed.email}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {ed.permissions.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] text-[10px] font-mono text-red-300"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditorEmailInput(ed.email);
                          setEditorNameInput(ed.name);
                          setEditorUidInput(ed.uid || '');
                          setEditorPermSelection(ed.permissions);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
                      >
                        এডিট
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeEditor(ed.email)}
                        className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-xs font-semibold text-red-300 cursor-pointer"
                      >
                        বাতিল
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: FIREBASE BACKEND INTEGRATION HUB (OWNER / ADMIN ONLY) */}
      {effectiveTab === 'firebase_hub' && isOwnerAdmin && (
        <div className="p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
            <div>
              <h2 className="font-editorial text-xl font-bold text-[#F5F2EB] flex items-center gap-2">
                <Flame className="h-5 w-5 text-[#EF4444]" />
                ফায়ারবেস ব্যাকএন্ড ইন্টিগ্রেশন হাব (Auth + Firestore + Storage)
              </h2>
              <p className="text-xs text-[#A69E95]">
                প্রোজেক্ট: {firebaseMeta.projectId} · রিয়েল-টাইম ডেটাবেস, অথেন্টিকেশন এবং মিডিয়া বাকেট সিঙ্ক সেন্টার
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
              <Database className="h-3.5 w-3.5" />
              {firebaseMeta.configured ? 'Firebase সংযুক্ত' : 'অসংযুক্ত'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <span className="text-xs text-[#A69E95]">Firebase Authentication</span>
              <p className="font-mono text-sm font-bold text-emerald-400">Google + Staff RBAC সক্রিয়</p>
              <p className="text-[11px] text-[#7D7670] truncate">Auth Domain: {firebaseMeta.authDomain}</p>
              <p className="text-[11px] text-[#9E968F] truncate">
                UID: {auth?.currentUser?.uid || user?.firebaseUid || 'সাইন-ইন করা'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <span className="text-xs text-[#A69E95]">Firestore Database</span>
              <p className="font-mono text-sm font-bold text-[#F5F2EB] truncate">{firebaseMeta.projectId}</p>
              <p className="text-[11px] text-[#7D7670] truncate">DB: {firebaseMeta.databaseId}</p>
              <p className="text-[11px] text-red-300">
                কালেকশন: stories · categories · users · orders · editors · admins · settings
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <span className="text-xs text-[#A69E95]">Firebase Cloud Storage Bucket</span>
              <p className="font-mono text-sm font-bold text-amber-300 truncate">
                {firebaseMeta.storageBucket || 'অনির্ধারিত'}
              </p>
              <p className="text-[11px] text-[#9E968F]">
                SDK যুক্ত আছে (অডিও, ভিডিও, পোস্টার সরাসরি বাকেটে আপলোড হবে; বাকেট তৈরির আগে সার্ভার ফলব্যাক চালু আছে)
              </p>
            </div>
          </div>

          {/* Live Firestore Diagnostics & Full Catalog Sync */}
          <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-editorial text-sm font-bold text-[#F5F2EB]">
                  লাইভ Firestore কানেক্টিভিটি ও ক্যাটালগ সিঙ্ক
                </h3>
                <p className="text-xs text-[#A69E95]">
                  সব গল্প ({stories.length}টি), ক্যাটাগরি, এবং প্ল্যাটফর্ম সেটিংস এক ক্লিকে Firestore-এ পুশ করুন এবং কানেকশন যাচাই করুন।
                </p>
              </div>
              {uploadProgress !== null && (
                <span className="font-mono text-xs px-2.5 py-1 rounded bg-red-500/20 text-red-300">
                  আপলোড: {uploadProgress}%
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const diag = await fetchFirestoreDiagnostics();
                    setFirestoreDiag({ checked: true, ...diag });
                    setStatusBanner(diag.message);
                  } catch {
                    setStatusBanner('Firestore সংযোগ যাচাইয়ে ত্রুটি হয়েছে (Security Rules বা নেটওয়ার্ক পরীক্ষা করুন)।');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.12] text-xs font-semibold text-[#F5F2EB] cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                <span>Firestore সংযোগ পরীক্ষা করুন</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setStatusBanner('Firestore-এ সম্পূর্ণ ক্যাটালগ সিঙ্ক হচ্ছে...');
                  try {
                    const result = await syncFullCatalogToFirestore(
                      stories,
                      categories,
                      customNPassPrice,
                    );
                    const diag = await fetchFirestoreDiagnostics().catch(() => null);
                    if (diag) setFirestoreDiag({ checked: true, ...diag });
                    setStatusBanner(
                      `সফল! ${result.syncedStories}টি গল্প এবং ${result.syncedCategories}টি ক্যাটাগরি Firestore-এ সিঙ্ক হয়েছে।`,
                    );
                  } catch (err) {
                    setStatusBanner(
                      err instanceof Error
                        ? `Firestore সিঙ্ক ব্যর্থ হয়েছে: ${err.message}`
                        : 'Firestore সিঙ্ক ব্যর্থ হয়েছে।',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#EF4444] text-white text-xs font-semibold cursor-pointer shadow-md shadow-red-950/30 disabled:opacity-50"
              >
                <Database className="h-4 w-4" />
                <span>সব গল্প ও ক্যাটাগরি Firestore-এ সিঙ্ক করুন</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
              >
                <Download className="h-4 w-4 text-red-400" />
                <span>JSON ব্যাকআপ ডাউনলোড</span>
              </button>

              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-[#F5F2EB] cursor-pointer">
                <Upload className="h-4 w-4 text-red-400" />
                <span>JSON ইমপোর্ট</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !authToken) return;
                    const text = await file.text();
                    try {
                      const parsed = JSON.parse(text);
                      const res = await fetch('/api/admin/import', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${authToken}`,
                        },
                        body: JSON.stringify(parsed),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setStories(data.stories);
                        onCatalogUpdated({ stories: data.stories, categories: data.categories });
                        setStatusBanner('ব্যাকআপ ডেটা সফলভাবে ইমপোর্ট সম্পন্ন হয়েছে!');
                      }
                    } catch {
                      setStatusBanner('JSON ফাইল ইমপোর্ট ব্যর্থ হয়েছে।');
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {firestoreDiag && (
              <div className="p-3.5 rounded-xl bg-[#0B090E] border border-white/[0.08] grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[#8C847C]">স্ট্যাটাস:</span>{' '}
                  <span className={firestoreDiag.connected ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {firestoreDiag.connected ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div>
                  <span className="text-[#8C847C]">Firestore গল্প:</span>{' '}
                  <span className="font-mono font-bold text-[#F5F2EB]">{firestoreDiag.storiesCount}</span>
                </div>
                <div>
                  <span className="text-[#8C847C]">ক্যাটাগরি:</span>{' '}
                  <span className="font-mono font-bold text-[#F5F2EB]">{firestoreDiag.categoriesCount}</span>
                </div>
                <div>
                  <span className="text-[#8C847C]">Admin Doc:</span>{' '}
                  <span className="font-mono font-semibold text-emerald-400">
                    {firestoreDiag.adminDocPresent ? 'Verified' : 'Bootstrapped'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bucket Creation & Custom Domain Launch Checklist */}
          <div className="p-5 rounded-xl bg-gradient-to-b from-[#1A1318] to-[#100C10] border border-amber-500/25 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-editorial text-sm font-bold text-amber-300">
                Storage বাকেট ও কাস্টম ডোমেইন লঞ্চ চেকলিস্ট
              </h3>
              <button
                type="button"
                onClick={async () => {
                  const snippet = `rules_version = '2';\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /stories/{folder}/{fileName} {\n      allow read: if folder in ['audio', 'video', 'artwork'];\n      allow write: if request.auth != null && request.auth.token.email_verified == true && folder in ['audio', 'video', 'artwork'] && request.resource.size <= 150 * 1024 * 1024;\n    }\n    match /{allPaths=**} { allow read, write: if false; }\n  }\n}`;
                  await navigator.clipboard?.writeText(snippet).catch(() => {});
                  setRulesCopied(true);
                  setTimeout(() => setRulesCopied(false), 3000);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 font-semibold cursor-pointer"
              >
                {rulesCopied ? 'Storage Rules কপি হয়েছে ✓' : 'storage.rules কপি করুন'}
              </button>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-[#D5CCC3] leading-relaxed">
              <li>
                <strong>Storage বাকেট তৈরি:</strong> Firebase Console → Storage → <em>Get Started</em>-এ গিয়ে{' '}
                <code className="font-mono text-amber-200">{firebaseMeta.storageBucket}</code> বাকেট চালু করে Rules ট্যাবে উপরের <code className="font-mono">storage.rules</code> পেস্ট করুন।
              </li>
              <li>
                <strong>কাস্টম ডোমেইন অনুমোদন:</strong> আপনার ডোমেইন যুক্ত করার পর Firebase Console → Authentication → Settings →{' '}
                <em>Authorized domains</em>-এ ডোমেইনটি যোগ করুন যাতে সব ব্রাউজারে Google লগইন কাজ করে।
              </li>
              <li>
                <strong>সার্ভার এনভায়রনমেন্ট:</strong> প্রোডাকশন হোস্টিং-এ{' '}
                <code className="font-mono text-emerald-300">OWNER_ADMIN_EMAILS</code> এবং <code className="font-mono text-emerald-300">GEMINI_API_KEY</code> সেট রাখুন।
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* TAB 6: CUSTOMER DATA & ORDER RECORDS (OWNER / ADMIN ONLY) */}
      {effectiveTab === 'users_orders' && isOwnerAdmin && (() => {
        const listenerUsers = allUsers.filter((u) => u.role !== 'admin');
        const verifiedOrders = allOrders.filter((o) => o.status === 'VERIFIED');
        const totalRevenue = verifiedOrders.reduce((sum, o) => sum + (o.amountInr || 0), 0);

        const q = customerSearch.trim().toLowerCase();
        const filteredUsers = allUsers.filter((u) => {
          if (!q) return true;
          return (
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.id.toLowerCase().includes(q)
          );
        });

        const handleExportCustomersCsv = () => {
          const header = ['Customer ID', 'Name', 'Email', 'Role', 'Language', 'Purchased Stories', 'Verified Orders', 'Total Spent INR'];
          const rows = allUsers.map((u) => {
            const userVerifiedOrders = verifiedOrders.filter((o) => o.userId === u.id);
            const spent = userVerifiedOrders.reduce((sum, o) => sum + (o.amountInr || 0), 0);
            const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
            return [
              esc(u.id),
              esc(u.name),
              esc(u.email),
              esc(u.role),
              esc(u.preferredLanguage === 'hi' ? 'Hindi' : 'Bengali'),
              esc(u.purchasedStoryIds.length),
              esc(userVerifiedOrders.length),
              esc(spent),
            ].join(',');
          });
          const csv = [header.join(','), ...rows].join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `goppo-kahini-customers-${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          setStatusBanner('কাস্টমার ডেটা CSV ফাইল ডাউনলোড সম্পন্ন হয়েছে!');
        };

        return (
          <div className="space-y-6">
            {/* Customer Analytics KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#16131A] to-[#0B090E] border border-white/[0.08] space-y-1">
                <span className="text-xs text-[#A69E95]">মোট কাস্টমার / শ্রোতা</span>
                <p className="font-mono-num text-2xl font-bold text-[#F5F2EB]">{listenerUsers.length}</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#16131A] to-[#0B090E] border border-white/[0.08] space-y-1">
                <span className="text-xs text-[#A69E95]">সকল নিবন্ধিত অ্যাকাউন্ট</span>
                <p className="font-mono-num text-2xl font-bold text-[#F5F2EB]">{allUsers.length}</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#16131A] to-[#0B090E] border border-white/[0.08] space-y-1">
                <span className="text-xs text-[#A69E95]">সফল টিকিট অর্ডার</span>
                <p className="font-mono-num text-2xl font-bold text-emerald-400">{verifiedOrders.length}</p>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-b from-[#16131A] to-[#0B090E] border border-white/[0.08] space-y-1">
                <span className="text-xs text-[#A69E95]">মোট যাচাইকৃত আয়</span>
                <p className="font-mono-num text-2xl font-bold text-[#EF4444]">₹{totalRevenue}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Registered Customer Directory */}
              <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
                  <div>
                    <h2 className="font-editorial text-lg font-bold text-[#F5F2EB]">
                      নিবন্ধিত কাস্টমার ডেটাবেস ({filteredUsers.length})
                    </h2>
                    <p className="text-xs text-[#A69E95]">
                      গ্রাহকের নাম, ইমেইল, ভাষা, কেনা গল্প ও খরচের সম্পূর্ণ তথ্য
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCustomersCsv}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-semibold text-[#F5F2EB] cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Download className="h-3.5 w-3.5 text-[#EF4444]" />
                    <span>CSV এক্সপোর্ট</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A69E95]" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="কাস্টমারের নাম বা ইমেইল দিয়ে খুঁজুন..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#0B090E] border border-white/[0.08] text-xs text-[#F5F2EB] focus:outline-none focus:border-[#EF4444]"
                  />
                </div>

                <div className="divide-y divide-white/[0.05] max-h-[420px] overflow-y-auto pr-1 text-xs">
                  {filteredUsers.length === 0 ? (
                    <p className="text-xs text-[#A69E95] py-6 text-center">
                      কোনো কাস্টমার তথ্য পাওয়া যায়নি।
                    </p>
                  ) : (
                    filteredUsers.map((u) => {
                      const userOrders = allOrders.filter((o) => o.userId === u.id);
                      const userSpent = userOrders
                        .filter((o) => o.status === 'VERIFIED')
                        .reduce((sum, o) => sum + (o.amountInr || 0), 0);
                      const purchasedTitles = u.purchasedStoryIds
                        .map((sid) => stories.find((s) => s.id === sid)?.title || sid)
                        .slice(0, 3);

                      return (
                        <div key={u.id} className="py-3.5 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-sm text-[#F5F2EB] truncate">{u.name}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-[#D1C5C5] font-mono">
                                {u.preferredLanguage === 'hi' ? 'हिंदी' : 'বাংলা'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono-num text-xs font-semibold text-emerald-400">
                                ₹{userSpent}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                  u.role === 'admin'
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    : 'bg-white/[0.06] text-[#A69E95]'
                                }`}
                              >
                                {u.role}
                              </span>
                            </div>
                          </div>
                          <p className="text-[#C8BFB5] font-mono">{u.email}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9E968F]">
                            <span>কেনা টিকিট: {u.purchasedStoryIds.length}</span>
                            <span>·</span>
                            <span>মোট অর্ডার: {userOrders.length}</span>
                            <span>·</span>
                            <span className="font-mono text-[#7D7670]">ID: {u.id}</span>
                          </div>
                          {purchasedTitles.length > 0 && (
                            <p className="text-[11px] text-red-300/90 truncate">
                              গল্প: {purchasedTitles.join(', ')}
                              {u.purchasedStoryIds.length > 3 ? ` (+${u.purchasedStoryIds.length - 3})` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Order & Ticket Transactions */}
              <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] shadow-xl space-y-4">
                <h2 className="font-editorial text-lg font-bold text-[#F5F2EB] border-b border-white/[0.06] pb-3">
                  অর্ডার ও টিকিট লেনদেন হিস্ট্রি ({allOrders.length})
                </h2>
                <div className="divide-y divide-white/[0.04] max-h-[460px] overflow-y-auto pr-1">
                  {allOrders.length === 0 ? (
                    <p className="text-xs text-[#A69E95] py-6 text-center">
                      এখনো কোনো টিকিট বিক্রির রেকর্ড নেই।
                    </p>
                  ) : (
                    allOrders.map((ord) => {
                      const buyer = allUsers.find((u) => u.id === ord.userId);
                      return (
                        <div key={ord.orderId} className="py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-bold text-[#F5F2EB] truncate">{ord.itemTitle}</p>
                            {buyer && (
                              <p className="text-[11px] text-[#C8BFB5] truncate">
                                {buyer.name} ({buyer.email})
                              </p>
                            )}
                            <p className="font-mono text-[11px] text-[#A69E95]">
                              {ord.orderId} · {new Date(ord.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono font-bold text-red-400">₹{ord.amountInr}</p>
                            <span
                              className={`text-[10px] font-bold ${
                                ord.status === 'VERIFIED'
                                  ? 'text-emerald-400'
                                  : ord.status === 'FAILED'
                                  ? 'text-red-400'
                                  : 'text-[#A69E95]'
                              }`}
                            >
                              {ord.status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
