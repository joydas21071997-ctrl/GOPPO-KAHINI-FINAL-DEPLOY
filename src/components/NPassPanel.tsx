import React from 'react';
import { Check, Crown } from 'lucide-react';
import type { UIStrings } from '../i18n/translations';
import type { UserProfile } from '../types/content';

interface NPassPanelProps {
  t: UIStrings;
  priceInr: number;
  user: UserProfile | null;
  onSubscribeClick: () => void;
}

export const NPassPanel: React.FC<NPassPanelProps> = ({
  t,
  priceInr,
  user,
  onSubscribeClick,
}) => {
  const isActive = user?.membership.status === 'ACTIVE';

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#16131A] via-[#100D14] to-[#09080B] border border-white/[0.08] p-6 sm:p-8 lg:p-10 shadow-2xl shadow-black/70">
      {/* Subtle ambient light gradient in background */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-3xl pointer-events-none"
      />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left 7 Columns: Crown Emblem, Title & Localized Benefits */}
        <div className="lg:col-span-7 space-y-4">
          <div className="inline-flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/15 to-transparent border border-red-500/30 shadow-inner">
              <Crown className="h-5 w-5 text-[#EF4444]" />
            </span>
            <span className="font-display-brand text-2xl sm:text-3xl font-bold text-[#F5F2EB] tracking-wide">
              {t.npass.title}
            </span>
          </div>

          <p className="text-sm sm:text-base text-[#9E968F] max-w-xl">
            {t.npass.subtitle}
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {t.npass.benefits.map((benefit, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-xs sm:text-sm text-[#C8BFB5] leading-snug"
              >
                <Check className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-[#7D7670] pt-1 leading-relaxed">
            {t.npass.policyNote}
          </p>
        </div>

        {/* Right 5 Columns: Pricing & Verified Action Box */}
        <div className="lg:col-span-5 flex flex-col items-start lg:items-end justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-[#120F16]/90 to-[#0A090D]/90 border border-white/[0.08] p-6 space-y-5 shadow-xl">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono-num text-4xl sm:text-5xl font-bold text-[#EF4444]">
                ₹{priceInr}
              </span>
              <span className="text-sm text-[#9E968F] font-medium">
                {t.npass.perMonth}
              </span>
            </div>

            {isActive ? (
              <div className="space-y-2">
                <div className="w-full py-3 px-4 rounded-xl bg-gradient-to-b from-red-500/15 to-transparent border border-red-500/30 text-center text-sm font-semibold text-red-400">
                  {t.npass.ctaActive}
                </div>
                {user?.membership.renewsAt && (
                  <p className="text-xs text-[#9E968F] text-center font-mono-num">
                    Valid till {new Date(user.membership.renewsAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onSubscribeClick}
                className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#DC2626] via-[#EF4444] to-[#B91C1C] hover:brightness-110 text-white font-semibold text-sm transition-all whitespace-nowrap cursor-pointer shadow-lg shadow-red-950/30"
              >
                {t.npass.ctaSubscribe}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
