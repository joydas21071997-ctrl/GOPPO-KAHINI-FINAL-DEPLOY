import React, { useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Crown,
  Headphones,
  Lock,
  Play,
  Share2,
  Sparkles,
  Ticket,
  Video,
  X,
} from 'lucide-react';
import type { Episode, PlaybackProgress, StoryItem, UserProfile } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import {
  getRemainingListens,
  hasExhaustedListens,
  hasVerifiedStoryAccess,
  isFreeStory,
} from '../utils/contentClassification';
import { getEpisodePath, getStoryPath } from '../utils/routes';
import { ArtworkImage } from './ArtworkImage';
import { SocialShareModal } from './SocialShareModal';
import { StoryProgressIndicator } from './StoryProgressIndicator';
import { AdSlotContainer, type AdSettings } from './AdSlotContainer';

interface EpisodeDetailsViewProps {
  story: StoryItem;
  episode: Episode;
  t: UIStrings;
  user: UserProfile | null;
  authToken?: string | null;
  progress?: PlaybackProgress[];
  activeTrackId?: string;
  isPlaying: boolean;
  adSettings?: AdSettings;
  onOpenStory: (storyId: string) => void;
  onOpenEpisode: (storyId: string, episodeId: string) => void;
  onPlayTrailer: (story: StoryItem) => void;
  onPlayEpisode: (story: StoryItem, episode: Episode) => void;
  onEpisodeComplete?: (story: StoryItem, episode: Episode) => void;
  onBuyTicket: (story: StoryItem) => void;
}

export const EpisodeDetailsView: React.FC<EpisodeDetailsViewProps> = ({
  story,
  episode,
  t,
  user,
  authToken,
  progress = [],
  activeTrackId,
  isPlaying,
  adSettings,
  onOpenStory,
  onOpenEpisode,
  onPlayTrailer,
  onPlayEpisode,
  onEpisodeComplete,
  onBuyTicket,
}) => {
  const [videoTheaterOpen, setVideoTheaterOpen] = useState(false);
  const [authorizedVideoUrl, setAuthorizedVideoUrl] = useState<string>('');
  const [shareOpen, setShareOpen] = useState(false);

  const openAuthorizedVideoTheater = async () => {
    const rawUrl = episode.videoUrl || '';
    if (!rawUrl) return;
    if (isFreeStory(story) || !rawUrl.startsWith('/api/uploads/') || rawUrl.includes('mt=')) {
      setAuthorizedVideoUrl(rawUrl);
      setVideoTheaterOpen(true);
      return;
    }
    try {
      const res = await fetch('/api/media/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          storyId: story.id,
          episodeId: episode.id,
          isTrailer: false,
          mediaKind: 'video',
        }),
      });
      const data = await res.json();
      if (res.ok && data?.streamUrl) {
        setAuthorizedVideoUrl(data.streamUrl);
        setVideoTheaterOpen(true);
        return;
      }
    } catch {
      // Fallback below
    }
    onBuyTicket(story);
  };

  const isFree = isFreeStory(story);
  const hasVerifiedAccess = hasVerifiedStoryAccess(user, story);
  const hasFullAccess = isFree || hasVerifiedAccess;
  const remainingListens = getRemainingListens(user, story.id);
  const exhaustedListens = hasExhaustedListens(user, story.id);

  const parentPath = getStoryPath(story);
  const episodePath = getEpisodePath(episode);
  const episodeShareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${episodePath}` : '';

  const isCurrentEpisode = activeTrackId === episode.id;
  const epProgress = progress.find(
    (p) => p.storyId === story.id && p.episodeId === episode.id && !p.isTrailer,
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Top Breadcrumb & Share Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#B6ABA1]">
          <a
            href={parentPath}
            onClick={(e) => {
              e.preventDefault();
              onOpenStory(story.id);
            }}
            className="inline-flex items-center gap-1.5 font-medium text-[#F5F2EB] hover:text-red-400 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{story.title}</span>
          </a>
          <ChevronRight className="h-3.5 w-3.5 text-white/25" />
          <span className="text-[#EF4444] font-mono-num">
            #{String(episode.number).padStart(2, '0')}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-[#F5F2EB] transition-all cursor-pointer"
        >
          <Share2 className="h-3.5 w-3.5 text-[#EF4444]" />
          <span>শেয়ার করুন</span>
        </button>
      </div>

      <SocialShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        title={`${episode.title} — ${story.title}`}
        url={episodeShareUrl}
        t={t}
      />

      {/* Video Theater for Video Episodes */}
      {videoTheaterOpen && (authorizedVideoUrl || episode.videoUrl) && (
        <div className="rounded-2xl bg-black border border-red-500/30 overflow-hidden shadow-2xl p-4 sm:p-6 space-y-3">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-red-400 font-semibold">
              <Video className="h-4 w-4" />
              <span>{`${story.title} — ${episode.title}`}</span>
            </div>
            <button
              type="button"
              onClick={() => setVideoTheaterOpen(false)}
              className="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs flex items-center gap-1 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>ভিডিও বন্ধ করুন</span>
            </button>
          </div>

          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/[0.08]">
            <video
              controls
              autoPlay
              playsInline
              src={authorizedVideoUrl || episode.videoUrl}
              onEnded={() => onEpisodeComplete?.(story, episode)}
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Episode Hero Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 max-w-sm mx-auto lg:max-w-none w-full">
          <a
            href={parentPath}
            onClick={(e) => {
              e.preventDefault();
              onOpenStory(story.id);
            }}
            className="block aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-b from-[#141117] to-[#0A090C] shadow-2xl shadow-black/80"
          >
            <ArtworkImage
              srcKeyOrUrl={story.coverArt}
              alt={`${episode.title} — ${story.title}`}
              eager
              className="h-full w-full object-cover"
            />
          </a>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-red-400">
            {isFree ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/35 text-xs font-bold text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t.badges.freeAdSupported}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/35 text-xs font-bold text-amber-300">
                <Crown className="h-3.5 w-3.5" />
                <span>{hasFullAccess ? t.badges.purchasedAdFree : t.badges.premiumAdFree}</span>
              </span>
            )}
            <span aria-hidden="true" className="text-white/20">·</span>
            <span>{t.categories[story.category]}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="text-[#F5F2EB]/90">{story.genre}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="font-mono-num text-[#F5F2EB]/90">{episode.durationLabel}</span>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-red-400">
              <a
                href={parentPath}
                onClick={(e) => {
                  e.preventDefault();
                  onOpenStory(story.id);
                }}
                className="hover:underline"
              >
                {story.title}
              </a>
            </p>
            <h1
              className="font-editorial text-2xl sm:text-4xl font-bold text-[#F5F2EB] leading-tight"
              style={{ textWrap: 'balance' }}
            >
              {episode.title}
            </h1>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm text-[#A69E95]">
            <div>
              <span className="text-white/40">{t.storyDetails.creditsWriter}: </span>
              <span className="text-[#F5F2EB] font-medium">{story.writer}</span>
            </div>
            <div>
              <span className="text-white/40">{t.storyDetails.creditsNarrator}: </span>
              <span className="text-[#F5F2EB] font-medium">{story.narrator}</span>
            </div>
          </div>

          {epProgress && epProgress.positionSeconds > 0 && (
            <div className="max-w-md">
              <StoryProgressIndicator
                progressSeconds={epProgress.positionSeconds}
                durationSeconds={epProgress.durationSeconds}
                t={t}
              />
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[#F5F2EB]/90">
              {t.storyDetails.synopsisHeading}
            </h2>
            <p className="text-sm sm:text-base text-[#B4ACA2] leading-relaxed max-w-3xl">
              {episode.synopsis || story.synopsis}
            </p>
          </div>

          {/* Primary Play / Video / Unlock Actions */}
          <div className="rounded-2xl bg-gradient-to-b from-[#16131A] via-[#120F16] to-[#0C0A0E] border border-red-500/20 p-5 sm:p-6 space-y-4 shadow-xl">
            {hasFullAccess ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-emerald-300 font-medium">
                    {isFree ? t.storyDetails.freeAccessNote : t.storyDetails.unlockedViaTicket}
                  </p>
                  {typeof remainingListens === 'number' && remainingListens > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-xs font-semibold text-amber-300 font-mono-num">
                      {t.storyDetails.remainingListensPrefix} {remainingListens}/2
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {episode.videoUrl && (
                    <button
                      type="button"
                      onClick={() => void openAuthorizedVideoTheater()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold shadow-md shadow-red-950/40 cursor-pointer"
                    >
                      <Video className="h-4 w-4" />
                      <span>ভিডিও দেখুন</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onPlayEpisode(story, episode)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-sm font-semibold shadow-md shadow-red-950/30 cursor-pointer"
                  >
                    <Headphones className="h-4 w-4" />
                    <span>
                      {isCurrentEpisode && isPlaying
                        ? t.player.nowPlaying
                        : t.storyDetails.playEpisode}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs sm:text-sm text-[#A69E95]">
                  {t.storyDetails.lockedEpisodeHint}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onBuyTicket(story)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-sm font-semibold shadow-md shadow-red-950/30 cursor-pointer"
                  >
                    <Ticket className="h-4 w-4" />
                    <span>
                      {exhaustedListens
                        ? t.storyDetails.repurchaseStoryTicket
                        : t.storyDetails.buyStoryTicket}{' '}
                      · <span className="font-mono-num">₹{story.ticketPriceInr}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onPlayTrailer(story)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-sm font-semibold text-[#F5F2EB] cursor-pointer"
                  >
                    <Play className="h-4 w-4 text-[#EF4444] fill-[#EF4444]" />
                    <span>{t.hero.playTrailer}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <AdSlotContainer
            placement="story_details_top"
            isAdFreeContent={hasVerifiedAccess}
            adSettings={adSettings}
          />
        </div>
      </div>

      {/* Sibling Episodes Navigation List */}
      {story.episodes.length > 1 && (
        <section className="space-y-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <h2 className="font-editorial text-xl sm:text-2xl font-bold text-[#F5F2EB]">
              {t.player.episodeListHeading}
            </h2>
            <a
              href={parentPath}
              onClick={(e) => {
                e.preventDefault();
                onOpenStory(story.id);
              }}
              className="text-xs sm:text-sm font-semibold text-[#EF4444] hover:text-red-300"
            >
              {story.title} →
            </a>
          </div>

          <div className="divide-y divide-white/[0.04] rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#120F16] to-[#0B090E] overflow-hidden">
            {story.episodes.map((ep) => {
              const isSelected = ep.id === episode.id;
              return (
                <div
                  key={ep.id}
                  className={`p-4 flex items-center justify-between gap-4 transition-colors ${
                    isSelected ? 'bg-red-500/10' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono-num text-xs text-red-400">
                        {String(ep.number).padStart(2, '0')}
                      </span>
                      <a
                        href={getEpisodePath(ep)}
                        onClick={(e) => {
                          e.preventDefault();
                          onOpenEpisode(story.id, ep.id);
                        }}
                        className="font-editorial text-base font-semibold text-[#F5F2EB] hover:text-red-400 transition-colors truncate"
                      >
                        {ep.title}
                      </a>
                      <span className="font-mono-num text-xs text-[#A69E95] shrink-0">
                        · {ep.durationLabel}
                      </span>
                    </div>
                    {ep.synopsis && (
                      <p className="text-xs text-[#A69E95] line-clamp-2">{ep.synopsis}</p>
                    )}
                  </div>

                  {hasFullAccess ? (
                    <button
                      type="button"
                      onClick={() => onPlayEpisode(story, ep)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-[#EF4444] text-xs font-semibold text-[#F5F2EB] hover:text-white border border-white/[0.08] shrink-0 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>{t.storyDetails.playEpisode}</span>
                    </button>
                  ) : (
                    <Lock className="h-4 w-4 text-[#EF4444] shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <AdSlotContainer
        placement="story_details_bottom"
        isAdFreeContent={hasVerifiedAccess}
        adSettings={adSettings}
      />
    </div>
  );
};
