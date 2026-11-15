import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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

function hashSnippet(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeAdHtmlSnippet(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (
    !/</.test(trimmed) &&
    (trimmed.startsWith('https://') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('//'))
  ) {
    const escapedSrc = trimmed.replace(/"/g, '&quot;');
    return `<script type="text/javascript" src="${escapedSrc}"><\/script>`;
  }
  return trimmed;
}

export const AdSlotContainer: React.FC<AdSlotContainerProps> = ({
  placement,
  isAdFreeContent,
  className = '',
  adSettings,
  compact = false,
}) => {
  const inlineContainerRef = useRef<HTMLDivElement>(null);
  const frameWrapperRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobileDevice();
  const instanceId = useId();
  const [containerWidth, setContainerWidth] = useState<number>(360);
  const [dynamicHeight, setDynamicHeight] = useState<number>(90);

  const { page, slot } = resolvePageAndSlot(placement);

  let selectedCode = '';
  let adDimensions: { width: number; height: number } | null = null;
  let isNativeSlot = false;

  if (!isAdFreeContent && adSettings && adSettings.enabled) {
    const pageAllowed = adSettings.pages?.[page] ?? true;
    const slotAllowed = adSettings.slots?.[slot] ?? true;

    if (pageAllowed && slotAllowed) {
      const nativeSnippet = isMobile
        ? adSettings.nativeAdMobileCode || adSettings.nativeAdCode
        : adSettings.nativeAdCode || adSettings.nativeAdMobileCode;
      const banner320 = isMobile
        ? adSettings.banner320x50Code || adSettings.banner320x50DesktopCode
        : adSettings.banner320x50DesktopCode || adSettings.banner320x50Code;

      if (placement === 'story_details_sidebar') {
        if (
          adSettings.banner160x300Code &&
          isAdAllowedOnDevice(adSettings, 'banner_160x300', isMobile)
        ) {
          selectedCode = adSettings.banner160x300Code;
          adDimensions = { width: 160, height: 300 };
        } else if (nativeSnippet && isAdAllowedOnDevice(adSettings, 'native_ad', isMobile)) {
          selectedCode = nativeSnippet;
          isNativeSlot = true;
        }
      } else if (placement === 'story_details_bottom' || placement === 'catalog_inline') {
        if (nativeSnippet && isAdAllowedOnDevice(adSettings, 'native_ad', isMobile)) {
          selectedCode = nativeSnippet;
          isNativeSlot = true;
        } else if (banner320 && isAdAllowedOnDevice(adSettings, 'banner_320x50', isMobile)) {
          selectedCode = banner320;
          adDimensions = { width: 320, height: 50 };
        }
      } else {
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

  const normalizedCode = normalizeAdHtmlSnippet(selectedCode);
  const usesScriptTag = /<script[\s>]/i.test(normalizedCode);
  const renderViaSrcDoc = Boolean(normalizedCode && (usesScriptTag || Boolean(adDimensions)));
  const snippetHash = useMemo(() => hashSnippet(normalizedCode), [normalizedCode]);
  const renderKey = `${placement}_${adSettings?.version || 1}_${isMobile ? 'm' : 'd'}_${snippetHash}`;
  const messageChannelId = `gk_ad_${instanceId}_${renderKey}`;

  useEffect(() => {
    const wrapper = frameWrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => {
      const nextWidth = wrapper.clientWidth;
      if (nextWidth > 0) {
        setContainerWidth(nextWidth);
      }
    };
    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [normalizedCode]);

  useEffect(() => {
    if (!renderViaSrcDoc || adDimensions) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; channel?: string; height?: number } | null;
      if (
        data &&
        data.type === 'gk-ad-resize' &&
        data.channel === messageChannelId &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height)
      ) {
        const clamped = Math.max(50, Math.min(600, Math.ceil(data.height)));
        setDynamicHeight(clamped);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [renderViaSrcDoc, adDimensions, messageChannelId]);

  useEffect(() => {
    const el = inlineContainerRef.current;
    if (!el) return;
    el.innerHTML = '';
    if (!normalizedCode || renderViaSrcDoc) return;

    try {
      const range = document.createRange();
      range.selectNode(el);
      const fragment = range.createContextualFragment(normalizedCode);
      el.appendChild(fragment);
    } catch {
      el.innerHTML = normalizedCode;
    }

    return () => {
      if (el) el.innerHTML = '';
    };
  }, [normalizedCode, renderViaSrcDoc, renderKey]);

  if (!normalizedCode) {
    return null;
  }

  const resizeScript = !adDimensions
    ? `<script>(function(){var ch=${JSON.stringify(messageChannelId)};function send(){try{var h=Math.max(document.body?document.body.scrollHeight:0,document.documentElement?document.documentElement.scrollHeight:0);if(h>0){window.parent.postMessage({type:'gk-ad-resize',channel:ch,height:h},'*');}}catch(e){}}window.addEventListener('load',send);if(typeof ResizeObserver!=='undefined'){try{new ResizeObserver(send).observe(document.body||document.documentElement);}catch(e){}}setTimeout(send,400);setTimeout(send,1400);setTimeout(send,3000);})();<\/script>`
    : '';

  const srcDocHtml = renderViaSrcDoc
    ? `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><base target="_top" /><style>html,body{margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;width:100%;${
        adDimensions ? 'height:100%;overflow:hidden;' : 'min-height:50px;overflow-x:hidden;'
      }}</style></head><body>${normalizedCode}${resizeScript}</body></html>`
    : '';

  const scale =
    adDimensions && containerWidth > 0 && containerWidth < adDimensions.width
      ? Math.max(0.75, containerWidth / adDimensions.width)
      : 1;
  const scaledHeight = adDimensions
    ? Math.ceil(adDimensions.height * scale)
    : dynamicHeight;

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

      {renderViaSrcDoc ? (
        <div
          ref={frameWrapperRef}
          className="w-full flex justify-center items-start overflow-hidden"
          style={{
            height: `${scaledHeight}px`,
          }}
        >
          <iframe
            key={renderKey}
            title={`Advertisement ${placement}`}
            srcDoc={srcDocHtml}
            width={adDimensions ? adDimensions.width : '100%'}
            height={adDimensions ? adDimensions.height : dynamicHeight}
            scrolling="no"
            frameBorder={0}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-top-navigation-by-user-activation allow-forms"
            style={
              adDimensions
                ? {
                    width: `${adDimensions.width}px`,
                    height: `${adDimensions.height}px`,
                    border: 'none',
                    overflow: 'hidden',
                    background: 'transparent',
                    transform: scale < 1 ? `scale(${scale})` : undefined,
                    transformOrigin: 'top center',
                    flexShrink: 0,
                  }
                : {
                    width: '100%',
                    height: `${dynamicHeight}px`,
                    border: 'none',
                    overflow: 'hidden',
                    background: 'transparent',
                  }
            }
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
