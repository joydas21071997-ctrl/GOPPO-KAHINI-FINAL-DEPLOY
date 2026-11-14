import React from 'react';
import { Crown, Headphones, Play, Sparkles, Ticket } from 'lucide-react';
import type { PlaybackProgress, StoryItem } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import { isFreeStory } from '../utils/contentClassification';
import { ArtworkImage } from './ArtworkImage';
import { StoryProgressIndicator } from './StoryProgressIndicator';

interface StoryCardProps {
  story: StoryItem;
  t: UIStrings;
  hasTicket: boolean;
  unlockedViaNPass: boolean;
  remainingListens?: number | null;
  exhaustedListens?: boolean;
  progressItem?: PlaybackProgress;
  onOpenDetails: (storyId: string) => void;
  onBuyTicket: (story: StoryItem) => void;
  onPlayTrailer: (story: StoryItem) => void;
}

export const StoryCard: React.FC<StoryCardProps> = ({
  story,
  t,
  hasTicket,
  unlockedViaNPass,
  remainingListens,
  exhaustedListens,
  progressItem,
  onOpenDetails,
  onBuyTicket,
  onPlayTrailer,
}) => {
  const isFree = isFreeStory(story);
  const hasFullAccess = isFree || hasTicket || unlockedViaNPass;
  const shortSummary = story.subtitle || story.synopsis;

  return (
    <article className="group flex flex-col rounded-xl bg-gradient-to-b from-[#141117] via-[#0F0D12] to-[#09080B] border border-white/[0.06] hover:border-red-500/30 transition-all duration-200 overflow-hidden h-full shadow-md shadow-black/40 hover:shadow-xl hover:shadow-black/70 min-w-0">
      {/* Compact Cover Artwork */}
      <div
        onClick={() => onOpenDetails(story.id)}
        className="relative aspect-[4/5] w-full overflow-hidden bg-[#0A090C] cursor-pointer"
      >
        <ArtworkImage
          srcKeyOrUrl={story.coverArt}
          alt={story.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#0F0D12] via-transparent to-black/40 opacity-90"
        />

        {/* Top Badges: Responsive width-clamped so they never overflow 2-column mobile cards */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1 pointer-events-none">
          {isFree ? (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-emerald-600/90 border border-emerald-400/40 text-[9px] sm:text-[10px] font-bold text-white shadow-sm backdrop-blur-sm max-w-[52%] truncate">
              <Sparkles className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{t.badges.free}</span>
            </span>
          ) : hasFullAccess ? (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-red-600/90 border border-red-400/40 text-[9px] sm:text-[10px] font-bold text-white shadow-sm backdrop-blur-sm max-w-[56%] truncate">
              <Headphones className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{t.badges.purchasedAdFree}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-amber-500/90 border border-amber-300/40 text-[9px] sm:text-[10px] font-bold text-[#140A0A] shadow-sm backdrop-blur-sm max-w-[52%] truncate">
              <Crown className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{t.badges.premium}</span>
            </span>
          )}

          <span className="px-1.5 py-0.5 rounded-md bg-black/70 border border-white/15 text-[9px] sm:text-[10px] font-medium text-[#F5F2EB]/90 backdrop-blur-sm truncate max-w-[44%]">
            {t.categories[story.category]}
          </span>
        </div>

        {/* Bottom Trailer Quick-Play Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlayTrailer(story);
          }}
          aria-label={`${t.hero.playTrailer}: ${story.title}`}
          title={t.badges.freePreview}
          className="absolute bottom-2 right-2 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-black/75 border border-white/20 text-red-300 hover:bg-[#EF4444] hover:text-white backdrop-blur-sm transition-all cursor-pointer shadow-md text-[10px] font-semibold"
        >
          <Play className="h-3 w-3 fill-current" />
          <span>{t.cards.preview}</span>
        </button>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col justify-between p-2.5 sm:p-3 gap-2 min-w-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-[#9E968F] truncate">
            <span className="truncate">{story.genre}</span>
            <span aria-hidden="true" className="text-white/20 shrink-0">·</span>
            <span className="font-mono-num shrink-0">{story.totalDurationLabel}</span>
          </div>

          <h3
            onClick={() => onOpenDetails(story.id)}
            className="font-editorial text-sm sm:text-[15px] font-bold text-[#F5F2EB] leading-snug line-clamp-2 cursor-pointer group-hover:text-red-400 transition-colors"
          >
            {story.title}
          </h3>

          {shortSummary && (
            <p className="text-[11px] text-[#A69E95] leading-snug line-clamp-2">
              {shortSummary}
            </p>
          )}
        </div>

        <div className="space-y-2 min-w-0">
          {progressItem && progressItem.positionSeconds > 0 && (
            <StoryProgressIndicator
              progressSeconds={progressItem.positionSeconds}
              durationSeconds={progressItem.durationSeconds}
              t={t}
            />
          )}

          {/* Mobile-Safe Ticket Price & Action Footer (Never overflows 2-column mobile cards) */}
          <div className="pt-2 border-t border-white/[0.06] w-full min-w-0">
            {isFree ? (
              <button
                type="button"
                onClick={() => onOpenDetails(story.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 transition-colors cursor-pointer"
              >
                <Headphones className="h-3 w-3 shrink-0" />
                <span className="truncate">{t.hero.listenFree}</span>
              </button>
            ) : hasFullAccess ? (
              <button
                type="button"
                onClick={() => onOpenDetails(story.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-gradient-to-b from-white/[0.06] to-white/[0.02] hover:bg-white/[0.09] border border-red-500/25 text-[11px] font-semibold text-red-300 transition-colors cursor-pointer"
              >
                <Headphones className="h-3 w-3 text-[#EF4444] shrink-0" />
                <span className="truncate">
                  {typeof remainingListens === 'number' && remainingListens > 0
                    ? `${t.cards.unlocked} (${remainingListens}/2)`
                    : t.cards.unlocked}
                </span>
              </button>
            ) : (
              <div className="flex flex-col gap-1.5 w-full min-w-0">
                <div className="flex items-center justify-between gap-1 w-full min-w-0">
                  <span className="font-mono-num text-xs sm:text-sm font-bold text-[#EF4444] shrink-0">
                    ₹{story.ticketPriceInr}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenDetails(story.id)}
                    className="py-0.5 px-1.5 rounded-md text-[10px] sm:text-[11px] font-medium text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.04] transition-colors cursor-pointer truncate"
                  >
                    {t.cards.details}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onBuyTicket(story)}
                  className="w-full inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white text-[11px] font-semibold transition-all cursor-pointer shadow-sm shadow-red-950/20"
                >
                  <Ticket className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {exhaustedListens ? t.cards.repurchaseTicket : t.cards.buyFor}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
