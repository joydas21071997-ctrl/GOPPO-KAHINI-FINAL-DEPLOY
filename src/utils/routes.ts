import type { ContentCategory, Episode, Language, StoryItem } from '../types/content';

export type StoryCollectionFilter = ContentCategory | 'all' | 'free' | 'premium' | 'videos';

export type InfoPageKey =
  | 'privacy'
  | 'terms'
  | 'copyright'
  | 'refund'
  | 'about'
  | 'contact';

export type ActiveRoute =
  | { view: 'home'; category?: ContentCategory }
  | { view: 'all_stories'; category?: StoryCollectionFilter }
  | { view: 'story'; storyId: string }
  | { view: 'episode'; storyId: string; episodeId: string }
  | { view: 'page'; page: InfoPageKey }
  | { view: 'npass' }
  | { view: 'library'; initialTab?: string }
  | { view: 'admin' };

export const INFO_PAGE_PATHS: Record<InfoPageKey, string> = {
  privacy: '/privacy-policy',
  terms: '/terms-and-conditions',
  copyright: '/copyright-policy',
  refund: '/refund-policy',
  about: '/about',
  contact: '/contact',
};

const PATH_TO_INFO_PAGE: Record<string, InfoPageKey> = {
  '/privacy-policy': 'privacy',
  '/terms-and-conditions': 'terms',
  '/copyright-policy': 'copyright',
  '/refund-policy': 'refund',
  '/about': 'about',
  '/contact': 'contact',
};

export function isVideoContent(story: Pick<StoryItem, 'category' | 'mediaType'>): boolean {
  return story.category === 'animation' || story.category === 'films' || story.mediaType === 'video';
}

export function isSeriesContent(story: Pick<StoryItem, 'category' | 'mediaType' | 'episodes'>): boolean {
  return !isVideoContent(story) && story.category === 'audio' && (story.episodes?.length || 0) > 1;
}

export function getStoryPath(story: Pick<StoryItem, 'id' | 'category' | 'mediaType' | 'episodes'>): string {
  const encodedId = encodeURIComponent(story.id);
  if (isVideoContent(story)) {
    return `/video/${encodedId}`;
  }
  if (isSeriesContent(story)) {
    return `/series/${encodedId}`;
  }
  return `/story/${encodedId}`;
}

export function getEpisodePath(episode: Pick<Episode, 'id'>): string {
  return `/episode/${encodeURIComponent(episode.id)}`;
}

export function findStoryByEpisodeId(
  episodeId: string,
  stories: StoryItem[],
): { story: StoryItem; episode: Episode } | null {
  for (const story of stories) {
    const ep = (story.episodes || []).find((item) => item.id === episodeId);
    if (ep) {
      return { story, episode: ep };
    }
  }
  return null;
}

export function getRoutePath(route: ActiveRoute, stories: StoryItem[] = []): string {
  switch (route.view) {
    case 'home':
      return '/';
    case 'all_stories': {
      switch (route.category) {
        case 'audio':
          return '/audio-series';
        case 'animation':
        case 'films':
        case 'videos':
          return '/videos';
        case 'premium':
          return '/premium';
        case 'free':
          return '/free-stories';
        case 'all':
        default:
          return '/stories';
      }
    }
    case 'npass':
      return '/premium';
    case 'page':
      return INFO_PAGE_PATHS[route.page] || '/';
    case 'library':
      return route.initialTab === 'account' ? '/account' : '/library';
    case 'admin':
      return '/admin';
    case 'episode':
      return `/episode/${encodeURIComponent(route.episodeId)}`;
    case 'story': {
      const matched = stories.find((s) => s.id === route.storyId);
      if (matched) return getStoryPath(matched);
      return `/story/${encodeURIComponent(route.storyId)}`;
    }
    default:
      return '/';
  }
}

export function safeDecodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseLocationToRoute(
  pathname: string,
  search: string,
  stories: StoryItem[] = [],
): ActiveRoute {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';

  if (cleanPath === '/') {
    try {
      const legacyStoryId = new URLSearchParams(search || '').get('story');
      if (legacyStoryId && legacyStoryId.trim()) {
        return { view: 'story', storyId: legacyStoryId.trim() };
      }
    } catch {
      // Ignore malformed query strings
    }
    return { view: 'home', category: 'audio' };
  }

  if (cleanPath === '/stories') return { view: 'all_stories', category: 'all' };
  if (cleanPath === '/audio-series') return { view: 'all_stories', category: 'audio' };
  if (cleanPath === '/videos') return { view: 'all_stories', category: 'videos' };
  if (cleanPath === '/premium') return { view: 'all_stories', category: 'premium' };
  if (cleanPath === '/free-stories') return { view: 'all_stories', category: 'free' };

  if (PATH_TO_INFO_PAGE[cleanPath]) {
    return { view: 'page', page: PATH_TO_INFO_PAGE[cleanPath] };
  }

  if (cleanPath === '/library') return { view: 'library', initialTab: 'my_stories' };
  if (cleanPath === '/account') return { view: 'library', initialTab: 'account' };
  if (cleanPath === '/admin') return { view: 'admin' };

  const episodeMatch = cleanPath.match(/^\/episode\/([^/]+)$/);
  if (episodeMatch?.[1]) {
    const episodeId = safeDecodeSegment(episodeMatch[1]);
    const found = findStoryByEpisodeId(episodeId, stories);
    return {
      view: 'episode',
      storyId: found?.story.id || '',
      episodeId,
    };
  }

  const contentMatch = cleanPath.match(/^\/(?:story|series|video)\/([^/]+)$/);
  if (contentMatch?.[1]) {
    return {
      view: 'story',
      storyId: safeDecodeSegment(contentMatch[1]),
    };
  }

  return { view: 'home', category: 'audio' };
}

export interface StaticPageSeoSpec {
  path: string;
  route: ActiveRoute;
  title: string;
  description: string;
  headingBn: string;
  headingHi: string;
  priority: string;
  changefreq: string;
}

export const SECTION_AND_INFO_SEO_SPECS: StaticPageSeoSpec[] = [
  {
    path: '/stories',
    route: { view: 'all_stories', category: 'all' },
    title: 'সব গল্প | All Bengali & Hindi Audio Stories & Videos – Goppo Kahini',
    description:
      'Browse the complete Goppo Kahini catalog of Bengali and Hindi audio stories, suspense series, animations, and short films.',
    headingBn: 'সব গল্প ও সম্পূর্ণ ক্যাটালগ',
    headingHi: 'सभी कहानियाँ और संपूर्ण कैटलॉग',
    priority: '0.9',
    changefreq: 'daily',
  },
  {
    path: '/audio-series',
    route: { view: 'all_stories', category: 'audio' },
    title: 'অডিও সিরিজ | Bengali & Hindi Audio Series – Goppo Kahini',
    description:
      'Listen to immersive multi-episode Bengali and Hindi audio dramas, supernatural thrillers, and folk mysteries on Goppo Kahini.',
    headingBn: 'অডিও সিরিজ সম্ভার',
    headingHi: 'ऑडियो सीरीज़ संग्रह',
    priority: '0.9',
    changefreq: 'daily',
  },
  {
    path: '/videos',
    route: { view: 'all_stories', category: 'videos' },
    title: 'অ্যানিমেশন ও ভিডিও | Animations & Short Films – Goppo Kahini',
    description:
      'Watch original Bengali and Hindi animated stories, visual tales, and indie short films on Goppo Kahini.',
    headingBn: 'অ্যানিমেশন ও ভিডিও গল্প',
    headingHi: 'एनिमेशन और वीडियो कहानियाँ',
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: '/premium',
    route: { view: 'all_stories', category: 'premium' },
    title: 'প্রিমিয়াম বিজ্ঞাপন-মুক্ত গল্প | Premium Stories – Goppo Kahini',
    description:
      'Unlock ad-free Bengali and Hindi premium audio stories and series for just ₹9 per story ticket on Goppo Kahini.',
    headingBn: 'প্রিমিয়াম বিজ্ঞাপন-মুক্ত গল্প',
    headingHi: 'प्रीमियम विज्ञापन-मुक्त कहानियाँ',
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: '/free-stories',
    route: { view: 'all_stories', category: 'free' },
    title: 'ফ্রি গল্প ও প্রিভিউ | Free Audio Stories & Trailers – Goppo Kahini',
    description:
      'Stream free Bengali and Hindi audio stories and promotional trailers at zero cost on Goppo Kahini.',
    headingBn: 'ফ্রি গল্প ও ট্রেলার প্রিভিউ',
    headingHi: 'मुफ़्त कहानियाँ और ट्रेलर प्रीव्यू',
    priority: '0.9',
    changefreq: 'weekly',
  },
  {
    path: '/about',
    route: { view: 'page', page: 'about' },
    title: 'আমাদের সম্পর্কে | About Us – Goppo Kahini',
    description:
      'Learn about Goppo Kahini, a bilingual Bengali and Hindi cinematic audio storytelling, animation, and short film platform.',
    headingBn: 'আমাদের সম্পর্কে — Goppo Kahini',
    headingHi: 'हमारे बारे में — Goppo Kahini',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/contact',
    route: { view: 'page', page: 'contact' },
    title: 'সহায়তা ও যোগাযোগ | Contact Us – Goppo Kahini',
    description:
      'Contact the Goppo Kahini customer support desk (hello@goppokahini.in) for listener help, ticket queries, or feedback.',
    headingBn: 'যোগাযোগ ও গ্রাহক সহায়তা',
    headingHi: 'संपर्क और ग्राहक सहायता',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    path: '/privacy-policy',
    route: { view: 'page', page: 'privacy' },
    title: 'গোপনীয়তা নীতি | Privacy Policy – Goppo Kahini',
    description:
      'Read the Goppo Kahini Privacy Policy detailing how listener accounts, playback progress, and payment references are protected.',
    headingBn: 'গোপনীয়তা নীতি (Privacy Policy)',
    headingHi: 'गोपनीयता नीति (Privacy Policy)',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    path: '/terms-and-conditions',
    route: { view: 'page', page: 'terms' },
    title: 'ব্যবহারের শর্তাবলী | Terms & Conditions – Goppo Kahini',
    description:
      'Review the Terms & Conditions for listening to free and single-ticket premium audio stories and films on Goppo Kahini.',
    headingBn: 'ব্যবহারের শর্তাবলী (Terms & Conditions)',
    headingHi: 'उपयोग की शर्तें (Terms & Conditions)',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    path: '/copyright-policy',
    route: { view: 'page', page: 'copyright' },
    title: 'কপিরাইট নীতি | Copyright Policy – Goppo Kahini',
    description:
      'Copyright, intellectual property, and digital anti-piracy protection policy for Goppo Kahini original audio and video works.',
    headingBn: 'মেধাস্বত্ব ও কপিরাইট নীতি (Copyright Policy)',
    headingHi: 'कॉपीराइट नीति (Copyright Policy)',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    path: '/refund-policy',
    route: { view: 'page', page: 'refund' },
    title: 'রিফান্ড ও বাতিলকরণ নীতি | Refund Policy – Goppo Kahini',
    description:
      'Understand Goppo Kahini digital ticket refund, failed transaction settlement, and zero-subscription policies.',
    headingBn: 'রিফান্ড ও বাতিলকরণ নীতি',
    headingHi: 'रिफंड और रद्दीकरण नीति',
    priority: '0.6',
    changefreq: 'monthly',
  },
];

export function findStaticSeoSpecByRoute(route: ActiveRoute): StaticPageSeoSpec | undefined {
  const path = getRoutePath(route);
  return SECTION_AND_INFO_SEO_SPECS.find((s) => s.path === path);
}

export function getLocalizedSectionTitle(spec: StaticPageSeoSpec, language: Language): string {
  return language === 'hi' ? spec.headingHi : spec.headingBn;
}
