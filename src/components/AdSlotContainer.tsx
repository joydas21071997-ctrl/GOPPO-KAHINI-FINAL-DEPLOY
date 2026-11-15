import React, { useEffect, useRef } from 'react';
import type { AdPageKey, AdSettings, AdSlotKey } from '../types/content';
import { useIsMobileDevice } from '../hooks/useIsMobileDevice';
import { isAdAllowedOnDevice } from '../utils/adConfig';

export type { AdSettings };

export type AdSlotPlacement =
  | AdSlotKey
  | 'home_between_racks'
  | 'free_story_details'
  | 'free_player_banner'
  | 'story_details_sidebar';

interface AdSlotContainerProps {
  placement: AdSlotPlacement;
  /** Strictly suppresses any ad rendering on Premium / Purchased ad-free content */
  isAdFreeContent: boolean;
  className?: string;
  adSettings?: AdSettings;
  compact?: boolean;
}

function resolvePageAndSlot(placement: AdSlotPlacement): {
  page: AdPageKey;
  slot: AdSlotKey;
} {
  switch (placement) {
    case 'home_top':
      return { page: 'home', slot: 'home_top' };
    case 'home_middle':
      return { page: 'home', slot: 'home_middle' };
    case 'home_bottom':
    case 'home_between_racks':
      return { page: 'home', slot: 'home_bottom' };
    case 'catalog_inline':
      return { page: 'catalog', slot: 'catalog_inline' };
    case 'story_details_top':
      return { page: 'story_details', slot: 'story_details_top' };
    case 'story_details_bottom':
    case 'free_story_details':
    case 'story_details_sidebar':
      return { page: 'story_details', slot: 'story_details_bottom' };
    case 'player_banner':
    case 'free_player_banner':
    default:
      return { page: 'player', slot: 'player_banner' };
  }
}

export const AdSlotContainer: React.FC<AdSlotContainerProps> = ({
  placement,
  isAdFreeContent,
  className = '',
  adSettings,
  compact = false,
}) => {
  const inlineContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobileDevice();

  // Compute resolved ad snippet unconditionally BEFORE hooks to obey React Rules of Hooks
  const { page, slot } = resolvePageAndSlot(placement);

  let selectedCode = '';
  let adDimensions: { width: number; height: number } | null = null;
  let isNativeSlot = false;

  if (!isAdFreeContent && adSettings && adSettings.enabled) {
    const pageAllowed = adSettings.pages?.[page] ?? true;
    const slotAllowed = adSettings.slots?.[slot] ?? true;

    if (pageAllowed && slotAllowed) {
      if (placement === 'story_details_sidebar') {
        // Vertical 160x300 or fallback to Native / 320x50
        if (adSettings.banner160x300Code && isAdAllowedOnDevice(adSettings, 'banner_160x300', isMobile)) {
          selectedCode = adSettings.banner160x300Code;
          adDimensions = { width: 160, height: 300 };
        } else if (
          (isMobile ? adSettings.nativeAdMobileCode || adSettings.nativeAdCode : adSettings.nativeAdCode) &&
          isAdAllowedOnDevice(adSettings, 'native_ad', isMobile)
        ) {
          selectedCode = isMobile
            ? adSettings.nativeAdMobileCode || adSettings.nativeAdCode
            : adSettings.nativeAdCode;
          isNativeSlot = true;
        }
      } else if (placement === 'story_details_bottom' || placement === 'catalog_inline') {
        // Prefer Native Ad if configured, else 320x50 banner
        const nativeSnippet = isMobile
          ? adSettings.nativeAdMobileCode || adSettings.nativeAdCode
          : adSettings.nativeAdCode;
        const banner320 = isMobile
          ? adSettings.banner320x50Code
          : adSettings.banner320x50DesktopCode || adSettings.banner320x50Code;

        if (nativeSnippet && isAdAllowedOnDevice(adSettings, 'native_ad', isMobile)) {
          selectedCode = nativeSnippet;
          isNativeSlot = true;
        } else if (banner320 && isAdAllowedOnDevice(adSettings, 'banner_320x50', isMobile)) {
          selectedCode = banner320;
          adDimensions = { width: 320, height: 50 };
        }
      } else {
        // Standard 320x50 placements (home_top, home_middle, home_bottom, story_details_top, player_banner)
        const banner320 = isMobile
          ? adSettings.banner320x50Code
          : adSettings.banner320x50DesktopCode || adSettings.banner320x50Code;
        const nativeSnippet = isMobile
          ? adSettings.nativeAdMobileCode || adSettings.nativeAdCode
          : adSettings.nativeAdCode;

        if (banner320 && isAdAllowedOnDevice(adSettings, 'banner_320x50', isMobile)) {
          selectedCode = banner320;
          adDimensions = { width: 320, height: 50 };
        } else if (
          placement !== 'free_player_banner' &&
          placement !== 'player_banner' &&
          nativeSnippet &&
          isAdAllowedOnDevice(adSettings, 'native_ad', isMobile)
        ) {
          selectedCode = nativeSnippet;
          isNativeSlot = true;
        }
      }
    }
  }

  const trimmedCode = selectedCode.trim();
  const usesScriptTag = /<script[\s>]/i.test(trimmedCode);
  const renderViaSrcDoc = Boolean(trimmedCode && adDimensions && usesScriptTag);
  const renderKey = `${placement}_${adSettings?.version || 1}_${isMobile ? 'm' : 'd'}_${trimmedCode.length}`;

  useEffect(() => {
    const el = inlineContainerRef.current;
    if (!el) return;
    el.innerHTML = '';
    if (!trimmedCode || renderViaSrcDoc) return;

    try {
      const range = document.createRange();
      range.selectNode(el);
      const fragment = range.createContextualFragment(trimmedCode);
      el.appendChild(fragment);
    } catch {
      el.innerHTML = trimmedCode;
    }

    return () => {
      if (el) el.innerHTML = '';
    };
  }, [trimmedCode, renderViaSrcDoc, renderKey]);

  if (!trimmedCode) {
    return null;
  }

  const srcDocHtml = renderViaSrcDoc
    ? `<!doctype html><html><head><base target="_top" /><style>html,body{margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;}</style></head><body>${trimmedCode}</body></html>`
    : '';

  return (
    <div
      data-ad-slot={placement}
      data-ad-version={adSettings?.version || 1}
      className={`${
        compact ? 'my-1.5 py-1 px-2' : 'my-4 p-2.5'
      } flex flex-col items-center justify-center overflow-hidden rounded-xl bg-black/35 border border-white/[0.08] shadow-md ${className}`}
    >
      <span className="text-[9px] uppercase tracking-wider text-white/40 mb-1">
        {isNativeSlot ? 'Recommended · Sponsored' : 'Sponsored Advertisement'}
      </span>

      {renderViaSrcDoc && adDimensions ? (
        <div className="w-full flex justify-center items-center overflow-hidden">
          <iframe
            key={renderKey}
            title={`Advertisement ${placement}`}
            srcDoc={srcDocHtml}
            width={adDimensions.width}
            height={adDimensions.height}
            scrolling="no"
            frameBorder={0}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-top-navigation-by-user-activation"
            style={{
              width: `${adDimensions.width}px`,
              height: `${adDimensions.height}px`,
              border: 'none',
              overflow: 'hidden',
              background: 'transparent',
            }}
          />
        </div>
      ) : (
        <div
          key={renderKey}
          ref={inlineContainerRef}
          className="w-full flex justify-center items-center overflow-x-auto min-h-[50px]"
        />
      )}
    </div>
  );
};
