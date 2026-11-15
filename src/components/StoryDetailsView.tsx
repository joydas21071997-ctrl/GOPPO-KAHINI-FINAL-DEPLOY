import React, { useState } from 'react';
import { ArrowLeft, Crown, Headphones, Lock, Play, Share2, Sparkles, Ticket, Video, X } from 'lucide-react';
import type { Episode, PlaybackProgress, StoryItem, UserProfile } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import {
  getRemainingListens,
  hasExhaustedListens,
  hasVerifiedStoryAccess,
  isFreeStory,
  isPremiumStory,
} from '../utils/contentClassification';
import { ArtworkImage } from './ArtworkImage';
import { SocialShareModal } from './SocialShareModal';
import { StoryProgressIndicator } from './StoryProgressIndicator';
import { AdSlotContainer, type AdSettings } from './AdSlotContainer';

interface StoryDetailsViewProps {
  story: StoryItem;
  t: UIStrings;
  user: UserProfile | null;
  progress?: PlaybackProgress[];
  activeTrackId?: string;
  isPlaying: boolean;
  adSettings?: AdSettings;
  onBack: () => void;
  onPlayTrailer: (story: StoryItem) => void;
  onPlayEpisode: (story: StoryItem, episode: Episode) => void;
  onEpisodeComplete?: (story: StoryItem, episode: Episode) => void;
  onBuyTicket: (story: StoryItem) => void;
}

export const StoryDetailsView: React.FC<StoryDetailsViewProps> = ({
  story,
  t,
  user,
  progress = [],
  activeTrackId,
  isPlaying,
  adSettings,
  onBack,
  onPlayTrailer,
  onPlayEpisode,
  onEpisodeComplete,
  onBuyTicket,
}) => {
  const [activeVideoModal, setActiveVideoModal] = useState<{
    url: string;
    title: string;
    episode?: Episode;
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const isFree = isFreeStory(story);
  const isPremium = isPremiumStory(story);
  const hasVerifiedAccess = hasVerifiedStoryAccess(user, story);
  const hasTicket = hasVerifiedAccess && Boolean(user?.purchasedStoryIds.includes(story.id));
  const hasFullAccess = isFree || hasVerifiedAccess;
  const remainingListens = getRemainingListens(user, story.id);
  const exhaustedListens = hasExhaustedListens(user, story.id);

  const isSeries = story.episodes.length > 1;
  const trailerTrackIdentifier = `${story.id}_trailer`;
  const isVideoStory =
    story.category === 'animation' || story.category === 'films' || story.mediaType === 'video';

  const storyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/story/${encodeURIComponent(story.id)}`
      : '';

  const storyOverallProgress = progress.find((p) => p.storyId === story.id);

  return (
    <div className="space-y-8 pb-12">
      {/* Back Navigation & Share Button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#B6ABA1] hover:text-[#F6F1E7] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t.storyDetails.back}</span>
        </button>

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
        title={story.title}
        url={storyUrl}
        t={t}
      />

      {/* Dedicated Video Theater Player (for Animation & Films) */}
      {activeVideoModal && (
        <div className="rounded-2xl bg-black border border-red-500/30 overflow-hidden shadow-2xl p-4 sm:p-6 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-red-400 font-semibold">
              <Video className="h-4 w-4" />
              <span>{activeVideoModal.title}</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveVideoModal(null)}
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
              src={activeVideoModal.url}
              onEnded={() => {
                if (activeVideoModal.episode) {
                  onEpisodeComplete?.(story, activeVideoModal.episode);
                }
              }}
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Contiguous Top Overview & Purchase Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 4 Columns: Portrait Artwork */}
        <div className="lg:col-span-4 max-w-sm mx-auto lg:max-w-none w-full">
          <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-b from-[#141117] to-[#0A090C] shadow-2xl shadow-black/80">
            <ArtworkImage
              srcKeyOrUrl={story.coverArt}
              alt={story.title}
              eager
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Right 8 Columns: Localized Metadata, Synopsis, Free Trailer & Purchase Module */}
        <div className="lg:col-span-8 space-y-6">
          {/* Clean Metadata & Free/Premium Badge */}
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
            <span>{t.storyDetails.languageLabel}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="text-[#F5F2EB]/90">{t.categories[story.category]}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="text-[#F5F2EB]/90">{story.genre}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="font-mono-num text-[#F5F2EB]/90">
              {isSeries
                ? `${story.episodes.length} ${t.hero.episodesUnit}`
                : t.hero.singleStory}
            </span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="font-mono-num text-[#F5F2EB]/90">
              {story.totalDurationLabel}
            </span>
            {isVideoStory && (
              <>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-[11px] font-semibold text-red-300">
                  ভিডিও কন্টেন্ট
                </span>
              </>
            )}
          </div>

          <div className="space-y-2">
            <h1
              className="font-editorial text-3xl sm:text-4xl font-bold text-[#F5F2EB] leading-tight"
              style={{ textWrap: 'balance' }}
            >
              {story.title}
            </h1>
            {story.subtitle && (
              <p className="text-base sm:text-lg text-red-400 font-editorial">
                {story.subtitle}
              </p>
            )}
          </div>

          {/* Credits */}
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

          {storyOverallProgress && storyOverallProgress.positionSeconds > 0 && (
            <div className="max-w-md">
              <StoryProgressIndicator
                progressSeconds={storyOverallProgress.positionSeconds}
                durationSeconds={storyOverallProgress.durationSeconds}
                t={t}
              />
            </div>
          )}

          {/* Synopsis */}
          <div className="space-y-2 pt-1">
            <h2 className="text-sm font-semibold text-[#F5F2EB]/90">
              {t.storyDetails.synopsisHeading}
            </h2>
            <p className="text-sm sm:text-base text-[#B4ACA2] leading-relaxed max-w-3xl">
              {story.synopsis}
            </p>
          </div>

          {/* Free Promotional Trailer / Preview Player Strip */}
          <div className="rounded-xl bg-gradient-to-b from-[#151219] to-[#0E0C12] border border-white/[0.06] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-red-400">
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                  {t.badges.trailerPreview}
                </span>
                <span>{t.storyDetails.trailerSectionTitle}</span>
                <span aria-hidden="true" className="text-white/20">·</span>
                <span className="font-mono-num">{story.trailerDurationLabel}</span>
              </div>
              <p className="text-sm font-medium text-[#F5F2EB]">{story.trailerTitle}</p>
              <p className="text-xs text-[#A69E95]">{t.storyDetails.trailerFreeNote}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {story.trailerVideoUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveVideoModal({
                      url: story.trailerVideoUrl!,
                      title: `ট্রেলার — ${story.title}`,
                    })
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-950/40 cursor-pointer"
                >
                  <Video className="h-4 w-4" />
                  <span>ভিডিও ট্রেলার দেখুন</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onPlayTrailer(story)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-sm font-semibold text-[#F5F2EB] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="h-4 w-4 text-[#EF4444] fill-[#EF4444]" />
                <span>
                  {activeTrackId === trailerTrackIdentifier && isPlaying
                    ? t.player.nowPlaying
                    : t.storyDetails.playPromotionalTrailer}
                </span>
              </button>
            </div>
          </div>

          {/* Promotional Trailer Ad Slot (shown to unpaid visitors & free trailer listeners) */}
          <AdSlotContainer
            placement="story_details_top"
            isAdFreeContent={hasVerifiedAccess}
            adSettings={adSettings}
          />

          {/* Contiguous Purchase & Access Module (Zero Subscription / Zero App Pass) */}
          <div className="rounded-2xl bg-gradient-to-b from-[#16131A] via-[#120F16] to-[#0C0A0E] border border-red-500/20 p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[#F5F2EB]">
                {isFree ? t.storyDetails.freeAccessHeading : t.storyDetails.accessCardHeading}
              </h2>
              {isPremium && !hasFullAccess && (
                <span className="font-mono-num text-2xl font-bold text-[#EF4444]">
                  ₹{story.ticketPriceInr}
                </span>
              )}
            </div>

            {isFree ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-emerald-300">{t.storyDetails.freeAccessNote}</p>
                  <p className="text-xs text-[#A69E95]">{t.storyDetails.freeBackendPendingNote}</p>
                </div>
                {story.episodes[0] && (
                  <button
                    type="button"
                    onClick={() => onPlayEpisode(story, story.episodes[0])}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all shadow-md whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Headphones className="h-4 w-4" />
                    <span>{t.hero.listenFree}</span>
                  </button>
                )}
              </div>
            ) : hasFullAccess ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="text-sm text-red-400">
                    {hasTicket ? t.storyDetails.unlockedViaTicket : t.storyDetails.unlockedViaNPass}
                  </p>
                  {typeof remainingListens === 'number' && remainingListens > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-xs font-semibold text-amber-300 font-mono-num">
                      {t.storyDetails.remainingListensPrefix} {remainingListens}/2
                    </span>
                  )}
                </div>
                {story.episodes[0] && (
                  <button
                    type="button"
                    onClick={() => onPlayEpisode(story, story.episodes[0])}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-sm font-semibold transition-all shadow-md shadow-red-950/30 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Headphones className="h-4 w-4" />
                    <span>{t.hero.listenNow}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {exhaustedListens && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-3.5 text-xs sm:text-sm text-amber-200 leading-relaxed">
                    {t.storyDetails.exhaustedListensNotice}
                  </div>
                )}

                <p className="text-xs sm:text-sm text-[#A69E95]">
                  {isSeries ? t.storyDetails.seriesUnlockNote : t.storyDetails.singleUnlockNote}
                </p>

                <p className="text-xs text-red-400">{t.storyDetails.premiumAdFreeBenefits}</p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onBuyTicket(story)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-sm font-semibold transition-all shadow-md shadow-red-950/30 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Ticket className="h-4 w-4" />
                    <span>
                      {exhaustedListens
                        ? t.storyDetails.repurchaseStoryTicket
                        : t.storyDetails.buyStoryTicket}{' '}
                      · <span className="font-mono-num">₹{story.ticketPriceInr}</span>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ad Boundary (Suppressed only for listeners with verified Ticket / N Pass) */}
      <AdSlotContainer
        placement="story_details_bottom"
        isAdFreeContent={hasVerifiedAccess}
        adSettings={adSettings}
      />

      {/* Complete Episode Listing */}
      <section className="space-y-4 pt-4 border-t border-white/[0.06]">
        <div className="flex items-center justify-between">
          <h2 className="font-editorial text-2xl font-bold text-[#F5F2EB]">
            {t.storyDetails.episodesHeading}
          </h2>
          <span className="font-mono-num text-xs sm:text-sm text-[#A69E95]">
            {story.episodes.length} {t.hero.episodesUnit}
          </span>
        </div>

        <div className="divide-y divide-white/[0.04] rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#120F16] to-[#0B090E] overflow-hidden">
          {story.episodes.map((ep) => {
            const isCurrentEpisode = activeTrackId === ep.id;
            const epProgress = progress.find(
              (p) => p.storyId === story.id && p.episodeId === ep.id && !p.isTrailer,
            );
            return (
              <div
                key={ep.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="space-y-1.5 max-w-2xl flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono-num text-xs text-red-400">
                      {String(ep.number).padStart(2, '0')}
                    </span>
                    <h3 className="font-editorial text-base sm:text-lg font-semibold text-[#F5F2EB]">
                      {ep.title}
                    </h3>
                    <span className="font-mono-num text-xs text-[#A69E95]">
                      · {ep.durationLabel}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#A69E95] leading-relaxed">
                    {ep.synopsis}
                  </p>
                  {epProgress && epProgress.positionSeconds > 0 && (
                    <div className="max-w-xs pt-1">
                      <StoryProgressIndicator
                        progressSeconds={epProgress.positionSeconds}
                        durationSeconds={epProgress.durationSeconds}
                        t={t}
                      />
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex flex-wrap items-center gap-2">
                  {hasFullAccess ? (
                    <>
                      {ep.videoUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveVideoModal({
                              url: ep.videoUrl!,
                              title: `${story.title} — ${ep.title}`,
                              episode: ep,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md shadow-red-950/40 cursor-pointer"
                        >
                          <Video className="h-3.5 w-3.5" />
                          <span>ভিডিও দেখুন</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onPlayEpisode(story, ep)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                          isCurrentEpisode && isPlaying
                            ? 'bg-[#EF4444] text-white shadow-sm'
                            : 'bg-white/[0.04] hover:bg-[#EF4444] text-[#F5F2EB] hover:text-white border border-white/[0.08]'
                        }`}
                      >
                        <Play className="h-4 w-4 fill-current" />
                        <span>
                          {isCurrentEpisode && isPlaying
                            ? t.player.nowPlaying
                            : t.storyDetails.playEpisode}
                        </span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBuyTicket(story)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] text-xs text-[#A69E95] hover:text-[#F5F2EB] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Lock className="h-3.5 w-3.5 text-[#EF4444]" />
                      <span>
                        {`${exhaustedListens ? t.storyDetails.repurchaseStoryTicket : t.storyDetails.buyStoryTicket} · ₹${story.ticketPriceInr}`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {adSettings?.banner160x300Code && (
          <AdSlotContainer
            placement="story_details_sidebar"
            isAdFreeContent={hasVerifiedAccess}
            adSettings={adSettings}
          />
        )}
      </section>
    </div>
  );
};
