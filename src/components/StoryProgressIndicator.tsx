import React from 'react';
import type { UIStrings } from '../i18n/translations';

interface StoryProgressIndicatorProps {
  progressSeconds: number;
  durationSeconds: number;
  t?: UIStrings;
  className?: string;
}

export const StoryProgressIndicator: React.FC<StoryProgressIndicatorProps> = ({
  progressSeconds,
  durationSeconds,
  t,
  className = '',
}) => {
  const safeDuration = Math.max(1, durationSeconds);
  const percentage = Math.min(100, Math.max(0, (progressSeconds / safeDuration) * 100));
  const isCompleted = percentage >= 95;

  const formatMinSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className={`space-y-1 w-full ${className}`}>
      <div className="flex items-center justify-between text-[11px] font-mono-num text-[#D1C5C5]">
        <span>
          {isCompleted
            ? t?.progress?.completed || 'সম্পন্ন (Completed)'
            : `${Math.round(percentage)}% ${t?.progress?.played || 'শোনা হয়েছে'}`}
        </span>
        <span>
          {formatMinSec(progressSeconds)} / {formatMinSec(safeDuration)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-red-600 to-[#EF4444]'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
