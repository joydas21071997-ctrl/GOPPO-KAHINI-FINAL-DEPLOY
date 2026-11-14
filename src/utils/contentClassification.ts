import type { PlaybackProgress, StoryItem, UserProfile } from '../types/content';

/**
 * Determines whether a story is Free (Ad-Supported) vs Premium (Individually Ticketed Ad-Free)
 * using the existing backend schema without adding or altering database fields.
 */
export function isFreeStory(story: StoryItem): boolean {
  return story.ticketPriceInr <= 0;
}

export function isPremiumStory(story: StoryItem): boolean {
  return story.ticketPriceInr > 0;
}

/**
 * Returns remaining full listens for a story ticket.
 * Returns null for admins or null/unrestricted, 0 if none left.
 */
export function getRemainingListens(
  user: UserProfile | null,
  storyId: string,
): number | null {
  if (!user) return 0;
  if (user.role === 'admin') return null;
  const ent = user.storyEntitlements?.[storyId];
  if (!ent) {
    return user.purchasedStoryIds.includes(storyId) ? 2 : 0;
  }
  return Math.max(0, ent.remainingListens);
}

export function getTotalListensUsed(
  user: UserProfile | null,
  storyId: string,
): number {
  if (!user) return 0;
  return user.storyEntitlements?.[storyId]?.totalListensUsed ?? 0;
}

export function hasExhaustedListens(
  user: UserProfile | null,
  storyId: string,
): boolean {
  if (!user || user.role === 'admin') return false;
  const ent = user.storyEntitlements?.[storyId];
  return Boolean(ent && ent.remainingListens <= 0 && ent.totalListensUsed > 0);
}

/**
 * Checks whether the current user has verified backend access to full episodes of a story.
 * Paid content requires active remainingListens > 0 (max 2 full listens per ₹9 purchase),
 * or active legacy membership / admin role.
 */
export function hasVerifiedStoryAccess(
  user: UserProfile | null,
  story: StoryItem,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const ent = user.storyEntitlements?.[story.id];
  if (ent) {
    if (ent.remainingListens > 0) return true;
    const hasLegacyPass =
      user.membership.status === 'ACTIVE' &&
      (story.accessPolicy === 'npass_included' || story.accessPolicy === 'both');
    return hasLegacyPass;
  }

  if (user.purchasedStoryIds.includes(story.id)) return true;

  const hasLegacyPass =
    user.membership.status === 'ACTIVE' &&
    (story.accessPolicy === 'npass_included' || story.accessPolicy === 'both');

  return hasLegacyPass;
}

export function isPurchasedStory(
  user: UserProfile | null,
  story: StoryItem,
): boolean {
  if (!user) return false;
  const ent = user.storyEntitlements?.[story.id];
  if (ent) {
    if (ent.remainingListens > 0) return true;
    return (
      user.membership.status === 'ACTIVE' &&
      (story.accessPolicy === 'npass_included' || story.accessPolicy === 'both')
    );
  }
  if (user.purchasedStoryIds.includes(story.id)) return true;
  return (
    user.membership.status === 'ACTIVE' &&
    (story.accessPolicy === 'npass_included' || story.accessPolicy === 'both')
  );
}

/**
 * Finds the highest-progress entry for a given story from backend-synced progress records.
 */
export function getStoryProgress(
  storyId: string,
  progressList: PlaybackProgress[],
): PlaybackProgress | undefined {
  return progressList.find((p) => p.storyId === storyId);
}
