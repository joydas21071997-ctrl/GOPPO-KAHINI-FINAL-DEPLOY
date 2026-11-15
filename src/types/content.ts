export type Language = 'bn' | 'hi';

export type ContentCategory = 'audio' | 'animation' | 'films';

export type CollectionKey = 'new';

/**
 * Explicit backend access policy per content item:
 * - 'ticket_only': Individual ticket required (not included in N Pass)
 * - 'npass_included': Included in N Pass only
 * - 'both': Accessible via active N Pass OR individual ticket purchase
 */
export type AccessPolicy = 'ticket_only' | 'npass_included' | 'both';

export type PublicationStatus = 'published' | 'draft';

export interface Episode {
  id: string;
  number: number;
  title: string;
  durationLabel: string;
  durationSeconds: number;
  audioKey: string;
  synopsis: string;
  audioUrl?: string;
  videoUrl?: string;
  mediaType?: 'audio' | 'video';
}

export interface StoryItem {
  id: string;
  language: Language;
  category: ContentCategory;
  collections: CollectionKey[];
  isFeaturedHero?: boolean;
  updatedAt: string;
  title: string;
  subtitle?: string;
  synopsis: string;
  writer: string;
  narrator: string;
  genre: string;
  coverArt: string;
  heroArt: string;
  trailerTitle: string;
  trailerDurationLabel: string;
  trailerDurationSeconds: number;
  trailerAudioKey: string;
  trailerAudioUrl?: string;
  trailerVideoUrl?: string;
  mediaType?: 'audio' | 'video';
  totalDurationLabel: string;
  ticketPriceInr: number;
  accessPolicy: AccessPolicy;
  publicationStatus: PublicationStatus;
  releaseYear: number;
  episodes: Episode[];
}

export interface CategoryConfig {
  id: ContentCategory;
  enabledByAdmin: boolean;
  publishedCountBn: number;
  publishedCountHi: number;
}

export type OrderItemType = 'story_ticket' | 'npass_monthly';

export type CheckoutState = 'ready' | 'pending' | 'successful' | 'failed';

export interface OrderRecord {
  orderId: string;
  userId: string;
  itemType: OrderItemType;
  storyId?: string;
  itemTitle: string;
  language: Language;
  amountInr: number;
  paymentMethod: 'upi' | 'card' | 'netbanking';
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  failureReason?: string;
  isSandboxVerification?: boolean;
  createdAt: string;
  verifiedAt?: string;
}

export interface MembershipRecord {
  planId: 'npass_monthly_9';
  priceInr: number;
  status: 'ACTIVE' | 'INACTIVE';
  activatedAt?: string;
  renewsAt?: string;
  verifiedOrderId?: string;
  isSandboxVerification?: boolean;
}

export interface PlaybackProgress {
  storyId: string;
  episodeId: string;
  isTrailer: boolean;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
}

export type UserRole = 'listener' | 'editor' | 'admin';

export type AdminPermission =
  | 'manage_stories'
  | 'manage_media'
  | 'manage_hero'
  | 'translate_stories'
  | 'manage_categories'
  | 'manage_settings'
  | 'manage_users_orders'
  | 'manage_editors'
  | 'export_import_catalog';

export interface EditorGrant {
  uid?: string;
  email: string;
  name: string;
  permissions: AdminPermission[];
  grantedBy: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_TICKET_PRICE_INR = 9;
export const MAX_LISTENS_PER_PURCHASE = 2;

export interface StoryTicketEntitlement {
  storyId: string;
  remainingListens: number;
  totalListensUsed: number;
  completedEpisodeIdsInCycle: string[];
  lastOrderId?: string;
  lastCompletedAt?: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  firebaseUid?: string;
  name: string;
  email: string;
  role: UserRole;
  permissions?: AdminPermission[];
  preferredLanguage: Language;
  purchasedStoryIds: string[];
  storyEntitlements?: Record<string, StoryTicketEntitlement>;
  membership: MembershipRecord;
}

export type AdTypeKey =
  | 'banner_320x50'
  | 'banner_160x300'
  | 'native_ad'
  | 'social_bar'
  | 'popunder'
  | 'smartlink';

export type AdPageKey = 'home' | 'catalog' | 'story_details' | 'player';

export type AdSlotKey =
  | 'home_top'
  | 'home_middle'
  | 'home_bottom'
  | 'catalog_inline'
  | 'story_details_top'
  | 'story_details_bottom'
  | 'player_banner';

export interface AdFormatControl {
  enabled: boolean;
  desktop: boolean;
  mobile: boolean;
}

export interface AdSettings {
  enabled: boolean;
  version: number;
  status: 'draft' | 'published';
  updatedAt?: string;
  publishedAt?: string;
  updatedBy?: string;
  // Ad codes (Universal/Mobile & Desktop overrides)
  socialBarScript: string;
  socialBarMobileScript: string;
  popunderScript: string;
  popunderMobileScript: string;
  smartlinkUrl: string;
  banner320x50Code: string;
  banner320x50DesktopCode: string;
  banner160x300Code: string;
  nativeAdCode: string;
  nativeAdMobileCode: string;
  // Format-level activation + Desktop/Mobile toggles
  enabledTypes: Record<AdTypeKey, AdFormatControl>;
  // Page-level visibility switches
  pages: Record<AdPageKey, boolean>;
  // Slot-level placement switches
  slots: Record<AdSlotKey, boolean>;
  // Global device targeting switches
  devices: {
    desktop: boolean;
    mobile: boolean;
  };
}

export interface BootstrapPayload {
  stories: StoryItem[];
  categories: CategoryConfig[];
  nPassMonthlyPriceInr: number;
  liveGatewayConnected: boolean;
  user: UserProfile | null;
  orders: OrderRecord[];
  progress: PlaybackProgress[];
  adSettings?: AdSettings;
}

