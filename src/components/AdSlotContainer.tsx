import React from 'react';

export type AdSlotPlacement =
  | 'home_between_racks'
  | 'free_story_details'
  | 'free_player_banner';

interface AdSlotContainerProps {
  placement: AdSlotPlacement;
  /** Strictly suppresses any future ad rendering on Premium / Purchased ad-free content */
  isAdFreeContent: boolean;
  className?: string;
}

/**
 * Future-ready Advertisement Slot Boundary.
 *
 * Per Phase-1 launch requirements:
 * - No ad network scripts (Adsterra or otherwise) are loaded in this phase.
 * - No fake ads or empty layout-breaking boxes are rendered.
 * - Premium and purchased content strictly pass `isAdFreeContent={true}` so ads never appear there.
 */
export const AdSlotContainer: React.FC<AdSlotContainerProps> = ({
  placement,
  isAdFreeContent,
  className = '',
}) => {
  if (isAdFreeContent) {
    return null;
  }

  // Future ad provider hook will mount inside this boundary when enabled.
  return (
    <div
      data-ad-slot={placement}
      data-ad-ready="true"
      aria-hidden="true"
      className={className ? `hidden ${className}` : 'hidden'}
    />
  );
};
