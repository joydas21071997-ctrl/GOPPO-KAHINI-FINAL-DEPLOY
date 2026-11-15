import type { AdFormatControl, AdPageKey, AdSettings, AdSlotKey, AdTypeKey } from '../types/content';

export function createDefaultAdSettings(status: 'draft' | 'published' = 'published'): AdSettings {
  return {
    enabled: false,
    version: 1,
    status,
    socialBarScript: '',
    socialBarMobileScript: '',
    popunderScript: '',
    popunderMobileScript: '',
    smartlinkUrl: '',
    banner320x50Code: '',
    banner320x50DesktopCode: '',
    banner160x300Code: '',
    nativeAdCode: '',
    nativeAdMobileCode: '',
    enabledTypes: {
      banner_320x50: { enabled: true, desktop: true, mobile: true },
      banner_160x300: { enabled: true, desktop: true, mobile: true },
      native_ad: { enabled: true, desktop: true, mobile: true },
      social_bar: { enabled: true, desktop: true, mobile: true },
      popunder: { enabled: true, desktop: true, mobile: true },
      smartlink: { enabled: true, desktop: true, mobile: true },
    },
    pages: {
      home: true,
      catalog: true,
      story_details: true,
      player: true,
    },
    slots: {
      home_top: true,
      home_middle: true,
      home_bottom: true,
      catalog_inline: true,
      story_details_top: true,
      story_details_bottom: true,
      player_banner: true,
    },
    devices: {
      desktop: true,
      mobile: true,
    },
  };
}

function normalizeFormatControl(raw: unknown, fallback = true): AdFormatControl {
  if (!raw || typeof raw !== 'object') {
    return { enabled: fallback, desktop: true, mobile: true };
  }
  const obj = raw as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : fallback,
    desktop: typeof obj.desktop === 'boolean' ? obj.desktop : true,
    mobile: typeof obj.mobile === 'boolean' ? obj.mobile : true,
  };
}

function asStr(val: unknown, maxLen = 12000): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

export function normalizeAdSettings(
  raw: unknown,
  fallbackStatus: 'draft' | 'published' = 'published',
): AdSettings {
  const defaults = createDefaultAdSettings(fallbackStatus);
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const d = raw as Record<string, unknown>;
  const rawTypes = (d.enabledTypes && typeof d.enabledTypes === 'object' ? d.enabledTypes : {}) as Record<
    string,
    unknown
  >;
  const rawPages = (d.pages && typeof d.pages === 'object' ? d.pages : {}) as Record<string, unknown>;
  const rawSlots = (d.slots && typeof d.slots === 'object' ? d.slots : {}) as Record<string, unknown>;
  const rawDevices = (d.devices && typeof d.devices === 'object' ? d.devices : {}) as Record<
    string,
    unknown
  >;

  let updatedAtStr: string | undefined;
  if (typeof d.updatedAt === 'string') {
    updatedAtStr = d.updatedAt.slice(0, 64);
  } else if (d.updatedAt && typeof (d.updatedAt as { toDate?: () => Date }).toDate === 'function') {
    updatedAtStr = (d.updatedAt as { toDate: () => Date }).toDate().toISOString();
  }

  const publishedAtStr = typeof d.publishedAt === 'string' ? d.publishedAt.slice(0, 64) : undefined;
  const updatedByStr = typeof d.updatedBy === 'string' ? d.updatedBy.slice(0, 128) : undefined;

  const types: Record<AdTypeKey, AdFormatControl> = {
    banner_320x50: normalizeFormatControl(rawTypes.banner_320x50, true),
    banner_160x300: normalizeFormatControl(rawTypes.banner_160x300, true),
    native_ad: normalizeFormatControl(rawTypes.native_ad, true),
    social_bar: normalizeFormatControl(rawTypes.social_bar, true),
    popunder: normalizeFormatControl(rawTypes.popunder, true),
    smartlink: normalizeFormatControl(rawTypes.smartlink, true),
  };

  const pages: Record<AdPageKey, boolean> = {
    home: typeof rawPages.home === 'boolean' ? rawPages.home : true,
    catalog: typeof rawPages.catalog === 'boolean' ? rawPages.catalog : true,
    story_details: typeof rawPages.story_details === 'boolean' ? rawPages.story_details : true,
    player: typeof rawPages.player === 'boolean' ? rawPages.player : true,
  };

  const slots: Record<AdSlotKey, boolean> = {
    home_top: typeof rawSlots.home_top === 'boolean' ? rawSlots.home_top : true,
    home_middle: typeof rawSlots.home_middle === 'boolean' ? rawSlots.home_middle : true,
    home_bottom: typeof rawSlots.home_bottom === 'boolean' ? rawSlots.home_bottom : true,
    catalog_inline: typeof rawSlots.catalog_inline === 'boolean' ? rawSlots.catalog_inline : true,
    story_details_top:
      typeof rawSlots.story_details_top === 'boolean' ? rawSlots.story_details_top : true,
    story_details_bottom:
      typeof rawSlots.story_details_bottom === 'boolean' ? rawSlots.story_details_bottom : true,
    player_banner: typeof rawSlots.player_banner === 'boolean' ? rawSlots.player_banner : true,
  };

  const devices = {
    desktop: typeof rawDevices.desktop === 'boolean' ? rawDevices.desktop : true,
    mobile: typeof rawDevices.mobile === 'boolean' ? rawDevices.mobile : true,
  };

  return {
    enabled: Boolean(d.enabled),
    version:
      typeof d.version === 'number' && Number.isFinite(d.version) && d.version >= 1
        ? Math.floor(d.version)
        : 1,
    status: d.status === 'draft' ? 'draft' : fallbackStatus,
    ...(updatedAtStr ? { updatedAt: updatedAtStr } : {}),
    ...(publishedAtStr ? { publishedAt: publishedAtStr } : {}),
    ...(updatedByStr ? { updatedBy: updatedByStr } : {}),
    socialBarScript: asStr(d.socialBarScript),
    socialBarMobileScript: asStr(d.socialBarMobileScript),
    popunderScript: asStr(d.popunderScript),
    popunderMobileScript: asStr(d.popunderMobileScript),
    smartlinkUrl: asStr(d.smartlinkUrl, 1000),
    banner320x50Code: asStr(d.banner320x50Code),
    banner320x50DesktopCode: asStr(d.banner320x50DesktopCode),
    banner160x300Code: asStr(d.banner160x300Code),
    nativeAdCode: asStr(d.nativeAdCode),
    nativeAdMobileCode: asStr(d.nativeAdMobileCode),
    enabledTypes: types,
    pages,
    slots,
    devices,
  };
}

export function isAdAllowedOnDevice(
  settings: AdSettings,
  type: AdTypeKey,
  isMobile: boolean,
): boolean {
  if (!settings.enabled) return false;
  if (isMobile && !settings.devices.mobile) return false;
  if (!isMobile && !settings.devices.desktop) return false;
  const ctrl = settings.enabledTypes[type];
  if (!ctrl || !ctrl.enabled) return false;
  return isMobile ? ctrl.mobile : ctrl.desktop;
}
