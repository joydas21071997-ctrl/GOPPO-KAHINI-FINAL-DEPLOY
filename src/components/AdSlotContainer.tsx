import React, { useEffect, useRef } from 'react';

export type AdSlotPlacement =
  | 'home_between_racks'
  | 'free_story_details'
  | 'free_player_banner'
  | 'story_details_sidebar';

export interface AdSettings {
  enabled: boolean;
  socialBarScript: string;
  popunderScript: string;
  smartlinkUrl: string;
  banner320x50Code: string;
  banner160x300Code: string;
}

interface AdSlotContainerProps {
  placement: AdSlotPlacement;
  /** Strictly suppresses any ad rendering on Premium / Purchased ad-free content */
  isAdFreeContent: boolean;
  className?: string;
  adSettings?: AdSettings;
}

export const AdSlotContainer: React.FC<AdSlotContainerProps> = ({
  placement,
  isAdFreeContent,
  className = '',
  adSettings,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  if (isAdFreeContent || !adSettings || !adSettings.enabled) {
    return null;
  }

  const adCode =
    placement === 'story_details_sidebar'
      ? adSettings.banner160x300Code || adSettings.banner320x50Code
      : adSettings.banner320x50Code || adSettings.banner160x300Code;

  if (!adCode || !adCode.trim()) {
    return null;
  }

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    try {
      const range = document.createRange();
      range.selectNode(containerRef.current);
      const fragment = range.createContextualFragment(adCode);
      containerRef.current.appendChild(fragment);
    } catch {
      containerRef.current.innerHTML = adCode;
    }
  }, [adCode]);

  return (
    <div
      data-ad-slot={placement}
      className={`my-4 flex flex-col items-center justify-center overflow-hidden rounded-xl bg-black/30 p-2.5 border border-white/10 shadow-md ${className}`}
    >
      <span className="text-[9px] uppercase tracking-wider text-white/40 mb-1">
        Sponsored Advertisement
      </span>
      <div
        ref={containerRef}
        className="w-full flex justify-center items-center overflow-x-auto min-h-[50px]"
      />
    </div>
  );
};

