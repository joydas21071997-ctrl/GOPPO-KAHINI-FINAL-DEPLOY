import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PlaybackProgress, StoryItem, UserProfile } from '../types/content';
import type { UIStrings } from '../i18n/translations';
import {
  getRemainingListens,
  getStoryProgress,
  hasExhaustedListens,
  hasVerifiedStoryAccess,
} from '../utils/contentClassification';
import { StoryCard } from './StoryCard';

interface StoryCarouselProps {
  title: string;
  subtitle?: string;
  stories: StoryItem[];
  t: UIStrings;
  user: UserProfile | null;
  progress?: PlaybackProgress[];
  onViewAll?: () => void;
  viewAllHref?: string;
  onOpenDetails: (storyId: string) => void;
  onBuyTicket: (story: StoryItem) => void;
  onPlayTrailer: (story: StoryItem) => void;
}

export const StoryCarousel: React.FC<StoryCarouselProps> = ({
  title,
  subtitle,
  stories,
  t,
  user,
  progress = [],
  onViewAll,
  viewAllHref,
  onOpenDetails,
  onBuyTicket,
  onPlayTrailer,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollByAmount = (dir: -1 | 1) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 340, behavior: 'smooth' });
  };

  if (stories.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3.5 rounded-2xl bg-gradient-to-b from-[#110E14]/85 via-[#0E0C11]/85 to-[#0A090C]/85 border border-white/[0.05] p-4 sm:p-5 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-editorial text-lg sm:text-xl font-bold text-[#F5F2EB]">
              {title}
            </h2>
            <span className="font-mono-num text-xs text-[#EF4444] font-semibold">
              · {stories.length} {t.racks.rackCountUnit}
            </span>
          </div>
          {subtitle && (
            <p className="text-xs text-[#9E968F] mt-0.5">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onViewAll &&
            (viewAllHref ? (
              <a
                href={viewAllHref}
                onClick={(e) => {
                  e.preventDefault();
                  onViewAll();
                }}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] hover:bg-white/[0.08] border border-white/[0.07] text-xs font-semibold text-[#EF4444] hover:text-[#F87171] transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.cards.viewAll} →
              </a>
            ) : (
              <button
                type="button"
                onClick={onViewAll}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] hover:bg-white/[0.08] border border-white/[0.07] text-xs font-semibold text-[#EF4444] hover:text-[#F87171] transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.cards.viewAll} →
              </button>
            ))}
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollByAmount(-1)}
              aria-label="Scroll Left"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.07] transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByAmount(1)}
              aria-label="Scroll Right"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] text-[#9E968F] hover:text-[#F5F2EB] hover:bg-white/[0.07] transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Story Rack Grid */}
      <div
        ref={scrollRef}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-3.5"
      >
        {stories.map((story) => {
          const hasTicket = hasVerifiedStoryAccess(user, story) && Boolean(user?.purchasedStoryIds.includes(story.id));
          const unlockedViaNPass = Boolean(
            user?.membership.status === 'ACTIVE' &&
              (story.accessPolicy === 'npass_included' || story.accessPolicy === 'both'),
          );

          return (
            <div key={story.id} className="min-w-0">
              <StoryCard
                story={story}
                t={t}
                hasTicket={hasTicket}
                unlockedViaNPass={unlockedViaNPass}
                remainingListens={getRemainingListens(user, story.id)}
                exhaustedListens={hasExhaustedListens(user, story.id)}
                progressItem={getStoryProgress(story.id, progress)}
                onOpenDetails={onOpenDetails}
                onBuyTicket={onBuyTicket}
                onPlayTrailer={onPlayTrailer}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
