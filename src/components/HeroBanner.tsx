import React, { useState } from 'react';
import { Check, Crown, Headphones, Layers, Play, Share2, SlidersHorizontal, Sparkles, Ticket, X } from 'lucide-react';
import type { PlaybackProgress, StoryItem, UserProfile } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import {
  getRemainingListens,
  hasExhaustedListens,
  isFreeStory,
} from '../utils/contentClassification';
import { getStoryPath } from '../utils/routes';
import { ArtworkImage } from './ArtworkImage';
import { StoryProgressIndicator } from './StoryProgressIndicator';

interface HeroBannerProps {
  story: StoryItem;
  allLanguageStories: StoryItem[];
  t: UIStrings;
  user: UserProfile | null;
  hasAccess: boolean;
  progressItem?: PlaybackProgress;
  onPlayTrailer: (story: StoryItem) => void;
  onPlayFirstEpisode: (story: StoryItem) => void;
  onBuyTicket: (story: StoryItem) => void;
  onOpenDetails: (storyId: string) => void;
  onSelectHeroStory: (storyId: string) => void;
  onShare?: (story: StoryItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  story,
  allLanguageStories,
  t,
  user,
  hasAccess,
  progressItem,
  onPlayTrailer,
  onPlayFirstEpisode,
  onBuyTicket,
  onOpenDetails,
  onSelectHeroStory,
  onShare,
}) => {
  const [selectorOpen, setSelectorOpen] = useState(false);

  const isFree = isFreeStory(story);
  const isAdmin =
    user?.role === 'admin' ||
    (user?.role === 'editor' && Boolean(user.permissions?.includes('manage_hero')));
  const canListenDirectly = isFree || hasAccess;
  const remainingListens = getRemainingListens(user, story.id);
  const exhaustedListens = hasExhaustedListens(user, story.id);

  const episodeInfo =
    story.episodes.length > 1
      ? `${story.episodes.length} ${t.hero.episodesUnit}`
      : t.hero.singleStory;

  const accessSummary = isFree
    ? t.hero.freeAccessSummary
    : hasAccess
      ? typeof remainingListens === 'number' && remainingListens > 0
        ? `${t.badges.purchasedAdFree} (${remainingListens}/2 ${t.cards.listensLeftUnit})`
        : t.badges.purchasedAdFree
      : t.hero.premiumAdFreeSummary;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#141117] via-[#0E0C11] to-[#08070A] shadow-2xl shadow-black/80">
      {/* Top Bar Inside Hero Box: "চলছে — শুনুন" + Admin-Only Hero Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-white/[0.03] via-white/[0.02] to-transparent border-b border-white/[0.06]">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#EF4444]">
          <Headphones className="h-3.5 w-3.5 text-[#EF4444]" />
          <span>{t.hero.nowShowingBadge}</span>
          <span aria-hidden="true" className="text-[#9E968F]/40">·</span>
          <span className="text-[#F5F2EB] font-medium truncate max-w-[180px] sm:max-w-xs">
            {story.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onShare && (
            <button
              type="button"
              onClick={() => onShare(story)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-[#C8BFB5] hover:text-[#F5F2EB] transition-colors cursor-pointer"
              aria-label="Share featured story"
            >
              <Share2 className="h-3.5 w-3.5 text-[#EF4444]" />
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setSelectorOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-red-400 hover:text-red-300 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#EF4444]" />
              <span>{t.hero.selectHeroStoryBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin-Only Interactive Story Selector Drawer */}
      {isAdmin && selectorOpen && (
        <div className="bg-[#0D0B10] border-b border-white/[0.07] p-4 sm:p-5 space-y-3.5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-editorial text-base sm:text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#EF4444]" />
                <span>{t.hero.selectHeroModalTitle}</span>
              </h2>
              <p className="text-xs text-[#9E968F]">{t.hero.selectHeroModalSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectorOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#9E968F] hover:text-[#F5F2EB] cursor-pointer"
              aria-label="Close selector"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-60 overflow-y-auto pr-1">
            {allLanguageStories.map((item) => {
              const isCurrent = item.id === story.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectHeroStory(item.id);
                    setSelectorOpen(false);
                  }}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-gradient-to-r from-red-500/15 to-transparent border-red-500/35 text-[#F5F2EB]'
                      : 'bg-white/[0.02] border-white/[0.05] text-[#9E968F] hover:border-white/[0.12] hover:text-[#F5F2EB] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="h-11 w-9 rounded-md overflow-hidden shrink-0 border border-white/[0.08]">
                    <ArtworkImage
                      srcKeyOrUrl={item.coverArt}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-editorial text-xs font-bold text-[#F5F2EB] truncate">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[#EF4444] truncate font-mono-num">
                      {t.categories[item.category]} · {isFreeStory(item) ? t.badges.free : `₹${item.ticketPriceInr}`}
                    </p>
                  </div>
                  {isCurrent && <Check className="h-4 w-4 text-[#EF4444] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Cinematic Hero Box Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch min-h-[360px] lg:min-h-[410px]">
        {/* Artwork Column */}
        <div className="relative lg:col-span-7 lg:order-2 min-h-[220px] sm:min-h-[280px] lg:min-h-full">
          <ArtworkImage
            srcKeyOrUrl={story.heroArt}
            alt={story.title}
            eager
            className="h-full w-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#0E0C11] via-[#0E0C11]/50 to-transparent lg:bg-gradient-to-r lg:from-[#0E0C11] lg:via-[#0E0C11]/60 lg:to-transparent"
          />
        </div>

        {/* Story Details & Controls Column */}
        <div className="relative z-10 lg:col-span-5 lg:order-1 flex flex-col justify-center p-5 sm:p-7 lg:p-9 -mt-10 lg:mt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#EF4444] mb-2.5">
            {isFree ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/35 text-[11px] font-bold text-emerald-300">
                <Sparkles className="h-3 w-3" />
                <span>{t.badges.free}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/35 text-[11px] font-bold text-amber-300">
                <Crown className="h-3 w-3" />
                <span>{t.badges.premiumAdFree}</span>
              </span>
            )}
            <span className="text-[#F5F2EB]/90">{t.categories[story.category]}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="text-[#F5F2EB]/80">{story.genre}</span>
          </div>

          <h1
            className="font-editorial text-2xl sm:text-3xl lg:text-4xl font-bold leading-[1.2] text-[#F5F2EB] mb-2.5 hover:text-red-400 transition-colors"
            style={{ textWrap: 'balance' }}
          >
            <a
              href={getStoryPath(story)}
              onClick={(e) => {
                e.preventDefault();
                onOpenDetails(story.id);
              }}
              className="cursor-pointer"
            >
              {story.title}
            </a>
          </h1>

          <p className="text-xs sm:text-sm text-[#9E968F] leading-relaxed line-clamp-3 mb-4 max-w-xl">
            {story.synopsis}
          </p>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#C8BFB5] mb-4 font-mono-num">
            <span>{episodeInfo}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span>{story.totalDurationLabel}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span className="font-sans text-xs text-[#EF4444]">{accessSummary}</span>
          </div>

          {progressItem && progressItem.positionSeconds > 0 && (
            <div className="mb-4 max-w-md">
              <StoryProgressIndicator
                progressSeconds={progressItem.positionSeconds}
                durationSeconds={progressItem.durationSeconds}
                t={t}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            {canListenDirectly ? (
              <button
                type="button"
                onClick={() => onPlayFirstEpisode(story)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-semibold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 shadow-md shadow-red-950/30 cursor-pointer"
              >
                <Headphones className="h-4 w-4" />
                <span>{isFree ? t.hero.listenFree : t.hero.listenNow}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onBuyTicket(story)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-semibold text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 shadow-md shadow-red-950/30 cursor-pointer"
              >
                <Ticket className="h-4 w-4" />
                <span>
                  {exhaustedListens ? t.cards.repurchaseTicket : t.hero.buyTicket} ·{' '}
                  <span className="font-mono-num">₹{story.ticketPriceInr}</span>
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onPlayTrailer(story)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] hover:bg-white/[0.08] border border-white/[0.09] text-[#F5F2EB] font-medium text-xs sm:text-sm transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 text-[#EF4444] fill-[#EF4444]" />
              <span>{t.hero.playTrailer}</span>
            </button>
          </div>

          {/* Admin Quick Switch Strip */}
          {isAdmin && allLanguageStories.length > 1 && (
            <div className="mt-5 pt-3.5 border-t border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {allLanguageStories.slice(0, 6).map((item) => {
                const active = item.id === story.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectHeroStory(item.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                      active
                        ? 'bg-red-500/20 text-red-300 font-semibold border border-red-500/30'
                        : 'bg-white/[0.02] text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.05] border border-white/[0.04]'
                    }`}
                  >
                    {item.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
