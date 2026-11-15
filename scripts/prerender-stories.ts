import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_STORIES } from '../server/catalogSeed.ts';
import { POLICIES } from '../src/data/policyData.ts';
import type { Episode, StoryItem } from '../src/types/content.ts';
import {
  SECTION_AND_INFO_SEO_SPECS,
  getEpisodePath,
  getStoryPath,
  isVideoContent,
} from '../src/utils/routes.ts';

const SITE_ORIGIN = (process.env.SEO_SITE_ORIGIN || 'https://goppokahini.in').replace(/\/+$/, '');
const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');
const TEMPLATE_PATH = path.join(DIST_DIR, 'index.html');
const FIREBASE_CONFIG_PATH = path.join(ROOT_DIR, 'firebase-applet-config.json');

const ARTWORK_PREFIX_MAP: Record<string, string> = {
  bn_hero_zamindar: 'bn_hero_zamindar_1793560332131',
  bn_cover_salbon: 'bn_cover_salbon_1793560333383',
  bn_cover_mandir: 'bn_cover_mandir_1793560335711',
  bn_cover_nouka: 'bn_cover_nouka_1793560336833',
  hi_hero_ghat: 'hi_hero_ghat_1793560338651',
  hi_cover_haveli: 'hi_cover_haveli_1793560340202',
  hi_cover_train: 'hi_cover_train_1793560342556',
  hi_cover_deodar: 'hi_cover_deodar_1793560342556',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const values = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return values.map(decodeFirestoreValue);
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function decodeFirestoreDocument(doc: any): StoryItem | null {
  const fields = doc?.fields;
  if (!fields) return null;
  const obj: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = decodeFirestoreValue(v);
  }
  if (!obj.id || !obj.title) return null;
  if (!Array.isArray(obj.episodes)) obj.episodes = [];
  return obj as StoryItem;
}

async function fetchPublishedStoriesFromFirestore(): Promise<StoryItem[]> {
  if (!fs.existsSync(FIREBASE_CONFIG_PATH)) return [];
  try {
    const cfg = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf8'));
    if (!cfg.projectId || !cfg.firestoreDatabaseId || !cfg.apiKey) return [];

    // Public Firestore structured query strictly matching `allow list: if resource.data.publicationStatus == 'published'`
    // Uses only public Firebase Web App config — zero secret keys or admin credentials.
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId,
    )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents:runQuery?key=${encodeURIComponent(
      cfg.apiKey,
    )}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'stories' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'publicationStatus' },
              op: 'EQUAL',
              value: { stringValue: 'published' },
            },
          },
        },
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[prerender] Firestore query returned HTTP ${res.status}; using catalog seed fallback.`);
      return [];
    }

    const rows = (await res.json()) as any[];
    if (!Array.isArray(rows)) return [];
    const parsed: StoryItem[] = [];
    for (const row of rows) {
      if (row?.document) {
        const story = decodeFirestoreDocument(row.document);
        if (story && story.publicationStatus === 'published') {
          parsed.push(story);
        }
      }
    }
    return parsed;
  } catch (err) {
    console.warn('[prerender] Could not fetch Firestore stories during build; using catalog seed fallback.', err);
    return [];
  }
}

function buildAssetFileIndex(): Map<string, string> {
  const index = new Map<string, string>();
  if (!fs.existsSync(ASSETS_DIR)) return index;
  const files = fs.readdirSync(ASSETS_DIR);
  for (const [key, prefix] of Object.entries(ARTWORK_PREFIX_MAP)) {
    const match = files.find((f) => f.startsWith(prefix) && /\.(jpg|jpeg|png|webp)$/i.test(f));
    if (match) {
      index.set(key, `${SITE_ORIGIN}/assets/${match}`);
    }
  }
  return index;
}

function resolveStoryImageUrl(coverArt: string | undefined, assetIndex: Map<string, string>): string {
  const defaultImg = `${SITE_ORIGIN}/assets/aistudio/Glossy_Red_Infinity_Ribbon_Logo_2028e914.png`;
  if (!coverArt) return defaultImg;
  if (assetIndex.has(coverArt)) return assetIndex.get(coverArt)!;
  if (coverArt.startsWith('http://') || coverArt.startsWith('https://')) return coverArt;
  if (coverArt.startsWith('/')) return `${SITE_ORIGIN}${coverArt}`;
  return defaultImg;
}

function replaceMetaTag(html: string, pattern: RegExp, replacement: string): string {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function truncateDescription(raw: string, maxLen = 158): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim() + '…';
}

function applySeoDocument(
  templateHtml: string,
  opts: {
    langCode: string;
    ogLocale: string;
    ogType: string;
    title: string;
    description: string;
    canonicalUrl: string;
    imageUrl: string;
    jsonLd: Record<string, unknown>;
    initialHtml: string;
    stripInlineCanonicalScript?: boolean;
  },
): string {
  let html = templateHtml;
  html = replaceMetaTag(html, /<html\s+lang="[^"]*"/i, `<html lang="${escapeHtml(opts.langCode)}"`);
  html = replaceMetaTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(opts.title)}</title>`);
  html = replaceMetaTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(opts.description)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(opts.canonicalUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="${escapeHtml(opts.ogType)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(opts.canonicalUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(opts.title)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(opts.description)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:locale" content="${escapeHtml(opts.ogLocale)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(opts.title)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(opts.description)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${escapeHtml(opts.imageUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>`,
  );

  if (opts.stripInlineCanonicalScript !== false) {
    html = html.replace(
      /<script>\s*\(function \(\) \{[\s\S]*?querySelector\('link\[rel="canonical"\]'\)[\s\S]*?<\/script>/i,
      '',
    );
  }

  html = html.replace(/<div\s+id=["']?root["']?\s*><\/div>/i, opts.initialHtml);
  return html;
}

/**
 * Homepage Initial HTML:
 * Visibly renders ONLY the branded crimson Goppo Kahini Splash Screen so visitors never see
 * an unstyled list of links flashing before React mounts. Meanwhile, semantic headings and
 * internal links stay cleanly accessible to search engine crawlers in an sr-only container.
 */
function buildHomepageInitialHtml(stories: StoryItem[]): string {
  const sectionLinks = SECTION_AND_INFO_SEO_SPECS.map(
    (s) => `<li><a href="${escapeHtml(s.path)}">${escapeHtml(s.headingBn)}</a></li>`,
  ).join('');

  const storyLinks = stories
    .map(
      (s) =>
        `<li><a href="${escapeHtml(getStoryPath(s))}">${escapeHtml(s.title)}</a>` +
        (s.subtitle ? ` — <span>${escapeHtml(s.subtitle)}</span>` : '') +
        `</li>`,
    )
    .join('');

  return (
    `<div id="root">` +
    `<div style="position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#580E0E 0%,#2F0808 50%,#140303 100%);color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;">` +
    `<div style="display:flex;flex-direction:column;align-items:center;gap:24px;">` +
    `<div style="padding:20px;border-radius:24px;background:rgba(0,0,0,0.4);border:1px solid rgba(239,68,68,0.3);box-shadow:0 25px 50px -12px rgba(0,0,0,0.6);">` +
    `<span style="display:inline-flex;align-items:center;gap:10px;white-space:nowrap;">` +
    `<img src="/assets/aistudio/Glossy_Red_Infinity_Ribbon_Logo_2028e914.png" alt="Goppo Kahini" style="height:36px;width:auto;object-fit:contain;" />` +
    `<span style="font-size:22px;font-weight:700;letter-spacing:0.025em;color:#F6F1E7;">Goppo Kahini</span>` +
    `</span>` +
    `</div>` +
    `<div style="text-align:center;">` +
    `<p style="font-size:26px;font-weight:700;letter-spacing:0.025em;color:#F6F1E7;margin:0 0 4px;">Goppo Kahini</p>` +
    `<p style="font-size:12px;color:#FCA5A5;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;margin:0;">Cinematic Audio &amp; Video Stories</p>` +
    `</div>` +
    `<div style="width:48px;height:4px;border-radius:9999px;background:rgba(239,68,68,0.45);overflow:hidden;"></div>` +
    `</div>` +
    `</div>` +
    `<div style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;">` +
    `<h1>Goppo Kahini — Bengali &amp; Hindi Audio Stories, Animation &amp; Films</h1>` +
    `<p>Stream original Bengali and Hindi audio stories, animations, and films on Goppo Kahini. Listen to free previews or unlock ad-free stories anytime.</p>` +
    `<nav aria-label="Primary Sections"><ul>${sectionLinks}</ul></nav>` +
    `<section aria-label="Featured Catalog"><ul>${storyLinks}</ul></section>` +
    `</div>` +
    `</div>`
  );
}

function buildStoryInitialHtml(story: StoryItem, imageUrl: string): string {
  const isHindi = story.language === 'hi';
  const langLabel = isHindi ? 'हिन्दी (Hindi)' : 'বাংলা (Bengali)';
  const categoryLabel =
    story.category === 'films'
      ? isHindi
        ? 'फ़िल्म'
        : 'ফিল্ম'
      : story.category === 'animation'
        ? isHindi
          ? 'एनिमेशन'
          : 'অ্যানিমেশন'
        : isHindi
          ? 'ऑडियो स्टोरी'
          : 'অডিও গল্প';

  const episodesList = (story.episodes || [])
    .map(
      (ep) =>
        `<li style="padding:10px 14px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:8px;background:#160B0D;">` +
        `<a href="${escapeHtml(getEpisodePath(ep))}" style="color:#F5F2EB;text-decoration:none;font-weight:700;">${escapeHtml(ep.title)}</a>` +
        (ep.durationLabel ? ` <span style="opacity:0.75;">(${escapeHtml(ep.durationLabel)})</span>` : '') +
        (ep.synopsis ? `<p style="margin:4px 0 0;opacity:0.8;font-size:14px;">${escapeHtml(ep.synopsis)}</p>` : '') +
        `</li>`,
    )
    .join('');

  return (
    `<div id="root"><div class="min-h-screen bg-[#09080B] text-[#F5F2EB]" style="max-width:960px;margin:0 auto;padding:24px 16px;font-family:sans-serif;">` +
    `<header style="margin-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;">` +
    `<a href="/" style="color:#EF4444;text-decoration:none;font-weight:700;font-size:18px;">Goppo Kahini</a>` +
    `<a href="/stories" style="color:#D6CEC7;text-decoration:none;font-size:14px;">All Stories</a>` +
    `<a href="/audio-series" style="color:#D6CEC7;text-decoration:none;font-size:14px;">Audio Series</a>` +
    `<a href="/videos" style="color:#D6CEC7;text-decoration:none;font-size:14px;">Videos</a>` +
    `</header>` +
    `<main><article>` +
    `<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;">` +
    `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(story.title)}" width="320" height="320" style="border-radius:16px;object-fit:cover;max-width:100%;" />` +
    `<div style="flex:1;min-width:260px;">` +
    `<p style="color:#EF4444;font-size:13px;font-weight:600;margin:0 0 8px;">${escapeHtml(langLabel)} · ${escapeHtml(categoryLabel)} · ${escapeHtml(story.genre)}</p>` +
    `<h1 style="font-size:30px;line-height:1.25;margin:0 0 8px;color:#F5F2EB;">${escapeHtml(story.title)}</h1>` +
    (story.subtitle
      ? `<p style="font-size:17px;color:#D6CEC7;margin:0 0 14px;">${escapeHtml(story.subtitle)}</p>`
      : '') +
    `<p style="font-size:15px;line-height:1.65;color:#E5DDD5;margin:0 0 16px;">${escapeHtml(story.synopsis)}</p>` +
    `<p style="font-size:13px;color:#B6ABA1;margin:0 0 6px;">Writer: ${escapeHtml(story.writer)} | Narrator: ${escapeHtml(story.narrator)}</p>` +
    `<p style="font-size:13px;color:#B6ABA1;margin:0;">Duration: ${escapeHtml(story.totalDurationLabel)} | Release Year: ${escapeHtml(String(story.releaseYear || 2026))}</p>` +
    `</div></div>` +
    (episodesList
      ? `<section style="margin-top:28px;"><h2 style="font-size:20px;margin-bottom:12px;">Episodes</h2><ul style="list-style:none;padding:0;margin:0;">${episodesList}</ul></section>`
      : '') +
    `</article></main></div></div>`
  );
}

function buildEpisodeInitialHtml(story: StoryItem, episode: Episode, imageUrl: string): string {
  const storyHref = getStoryPath(story);
  const siblingLinks = (story.episodes || [])
    .map(
      (ep) =>
        `<li style="margin-bottom:8px;"><a href="${escapeHtml(getEpisodePath(ep))}" style="color:#F5F2EB;text-decoration:underline;">${escapeHtml(ep.title)}</a>` +
        (ep.durationLabel ? ` <span>(${escapeHtml(ep.durationLabel)})</span>` : '') +
        `</li>`,
    )
    .join('');

  return (
    `<div id="root"><div class="min-h-screen bg-[#09080B] text-[#F5F2EB]" style="max-width:960px;margin:0 auto;padding:24px 16px;font-family:sans-serif;">` +
    `<header style="margin-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px;">` +
    `<a href="/" style="color:#EF4444;text-decoration:none;font-weight:700;font-size:18px;">Goppo Kahini</a> · ` +
    `<a href="${escapeHtml(storyHref)}" style="color:#D6CEC7;text-decoration:underline;">${escapeHtml(story.title)}</a>` +
    `</header>` +
    `<main><article>` +
    `<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;">` +
    `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(episode.title)}" width="300" height="300" style="border-radius:16px;object-fit:cover;max-width:100%;" />` +
    `<div style="flex:1;min-width:260px;">` +
    `<p style="color:#EF4444;font-size:13px;font-weight:600;margin:0 0 8px;">${escapeHtml(story.title)} · Episode ${episode.number} · ${escapeHtml(episode.durationLabel)}</p>` +
    `<h1 style="font-size:28px;line-height:1.25;margin:0 0 12px;color:#F5F2EB;">${escapeHtml(episode.title)}</h1>` +
    `<p style="font-size:15px;line-height:1.65;color:#E5DDD5;margin:0 0 14px;">${escapeHtml(episode.synopsis || story.synopsis)}</p>` +
    `<p style="font-size:13px;color:#B6ABA1;margin:0;">Writer: ${escapeHtml(story.writer)} | Narrator: ${escapeHtml(story.narrator)}</p>` +
    `</div></div>` +
    (siblingLinks
      ? `<section style="margin-top:28px;"><h2 style="font-size:18px;margin-bottom:12px;">All Episodes</h2><ul style="list-style:none;padding:0;margin:0;">${siblingLinks}</ul></section>`
      : '') +
    `</article></main></div></div>`
  );
}

function buildSectionInitialHtml(title: string, description: string, items: StoryItem[]): string {
  const listHtml = items
    .map(
      (s) =>
        `<li style="margin-bottom:10px;"><a href="${escapeHtml(getStoryPath(s))}" style="color:#F5F2EB;font-weight:600;text-decoration:underline;">${escapeHtml(s.title)}</a>` +
        (s.subtitle ? ` — <span style="opacity:0.8;">${escapeHtml(s.subtitle)}</span>` : '') +
        `</li>`,
    )
    .join('');

  return (
    `<div id="root"><div class="min-h-screen bg-[#09080B] text-[#F5F2EB]" style="max-width:960px;margin:0 auto;padding:24px 16px;font-family:sans-serif;">` +
    `<header style="margin-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;">` +
    `<a href="/" style="color:#EF4444;text-decoration:none;font-weight:700;font-size:18px;">Goppo Kahini</a>` +
    `<a href="/stories" style="color:#D6CEC7;text-decoration:none;">সব গল্প</a>` +
    `<a href="/audio-series" style="color:#D6CEC7;text-decoration:none;">অডিও সিরিজ</a>` +
    `<a href="/videos" style="color:#D6CEC7;text-decoration:none;">অ্যানিমেশন ও ভিডিও</a>` +
    `<a href="/premium" style="color:#D6CEC7;text-decoration:none;">প্রিমিয়াম</a>` +
    `<a href="/free-stories" style="color:#D6CEC7;text-decoration:none;">ফ্রি গল্প</a>` +
    `</header>` +
    `<main><h1 style="font-size:28px;margin:0 0 10px;color:#F5F2EB;">${escapeHtml(title)}</h1>` +
    `<p style="font-size:15px;color:#D6CEC7;margin:0 0 20px;">${escapeHtml(description)}</p>` +
    `<ul style="list-style:none;padding:0;margin:0;">${listHtml}</ul></main>` +
    `</div></div>`
  );
}

function buildInfoInitialHtml(pageKey: keyof typeof POLICIES.bn): string {
  const doc = POLICIES.bn[pageKey];
  const sectionsHtml = doc.sections
    .map(
      (sec) =>
        `<section style="margin-bottom:20px;">` +
        `<h2 style="font-size:19px;color:#EF4444;margin:0 0 8px;">${escapeHtml(sec.title)}</h2>` +
        sec.paragraphs.map((p) => `<p style="margin:0 0 8px;color:#D6CEC7;line-height:1.6;">${escapeHtml(p)}</p>`).join('') +
        (sec.bullets
          ? `<ul style="margin:8px 0 0 18px;color:#B6ABA1;">${sec.bullets.map((b) => `<li style="margin-bottom:4px;">${escapeHtml(b)}</li>`).join('')}</ul>`
          : '') +
        `</section>`,
    )
    .join('');

  return (
    `<div id="root"><div class="min-h-screen bg-[#09080B] text-[#F5F2EB]" style="max-width:900px;margin:0 auto;padding:24px 16px;font-family:sans-serif;">` +
    `<header style="margin-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px;">` +
    `<a href="/" style="color:#EF4444;text-decoration:none;font-weight:700;font-size:18px;">Goppo Kahini</a>` +
    `</header>` +
    `<main><article>` +
    `<h1 style="font-size:28px;margin:0 0 12px;color:#F5F2EB;">${escapeHtml(doc.title)}</h1>` +
    `<p style="font-size:15px;color:#D6CEC7;margin:0 0 22px;line-height:1.6;">${escapeHtml(doc.intro)}</p>` +
    sectionsHtml +
    `</article></main></div></div>`
  );
}

function renderStoryDocument(
  templateHtml: string,
  story: StoryItem,
  assetIndex: Map<string, string>,
): string {
  const canonicalPath = getStoryPath(story);
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const titleText = `${story.title} – Goppo Kahini`;
  const rawDesc = `${story.subtitle ? `${story.subtitle}. ` : ''}${story.synopsis}`.trim();
  const descriptionText = truncateDescription(rawDesc, 158);
  const imageUrl = resolveStoryImageUrl(story.coverArt, assetIndex);
  const langCode = story.language === 'hi' ? 'hi' : 'bn';
  const ogLocale = story.language === 'hi' ? 'hi_IN' : 'bn_IN';
  const schemaType =
    story.category === 'films'
      ? 'Movie'
      : story.category === 'animation'
        ? 'TVSeries'
        : 'CreativeWorkSeries';

  return applySeoDocument(templateHtml, {
    langCode,
    ogLocale,
    ogType: 'article',
    title: titleText,
    description: descriptionText,
    canonicalUrl,
    imageUrl,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': schemaType,
      name: story.title,
      headline: story.subtitle || story.title,
      description: story.synopsis,
      url: canonicalUrl,
      image: imageUrl,
      inLanguage: langCode,
      genre: story.genre,
      author: {
        '@type': 'Person',
        name: story.writer || 'Goppo Kahini Studio',
      },
      publisher: {
        '@type': 'Organization',
        name: 'Goppo Kahini',
        url: SITE_ORIGIN,
      },
      offers: {
        '@type': 'Offer',
        price: String(story.ticketPriceInr ?? 0),
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
      },
    },
    initialHtml: buildStoryInitialHtml(story, imageUrl),
  });
}

function renderEpisodeDocument(
  templateHtml: string,
  story: StoryItem,
  episode: Episode,
  assetIndex: Map<string, string>,
): string {
  const canonicalUrl = `${SITE_ORIGIN}${getEpisodePath(episode)}`;
  const titleText = `${episode.title} – ${story.title} – Goppo Kahini`;
  const descriptionText = truncateDescription(episode.synopsis || story.synopsis, 158);
  const imageUrl = resolveStoryImageUrl(story.coverArt, assetIndex);
  const langCode = story.language === 'hi' ? 'hi' : 'bn';
  const ogLocale = story.language === 'hi' ? 'hi_IN' : 'bn_IN';

  return applySeoDocument(templateHtml, {
    langCode,
    ogLocale,
    ogType: 'article',
    title: titleText,
    description: descriptionText,
    canonicalUrl,
    imageUrl,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': isVideoContent(story) ? 'VideoObject' : 'PodcastEpisode',
      name: episode.title,
      episodeNumber: episode.number,
      description: episode.synopsis || story.synopsis,
      url: canonicalUrl,
      image: imageUrl,
      inLanguage: langCode,
      partOfSeries: {
        '@type': 'CreativeWorkSeries',
        name: story.title,
        url: `${SITE_ORIGIN}${getStoryPath(story)}`,
      },
      publisher: {
        '@type': 'Organization',
        name: 'Goppo Kahini',
        url: SITE_ORIGIN,
      },
    },
    initialHtml: buildEpisodeInitialHtml(story, episode, imageUrl),
  });
}

function writeHtmlAtRoute(routePath: string, html: string): void {
  const cleanRel = routePath.replace(/^\/+|\/+$/g, '');
  if (!cleanRel) return;
  const dir = path.join(DIST_DIR, cleanRel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

async function runPrerender() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Missing built dist/index.html at ${TEMPLATE_PATH}. Run vite build first.`);
  }

  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const assetIndex = buildAssetFileIndex();
  const firestoreStories = await fetchPublishedStoriesFromFirestore();
  const defaultOgImage = `${SITE_ORIGIN}/assets/aistudio/Glossy_Red_Infinity_Ribbon_Logo_2028e914.png`;

  const mergedById = new Map<string, StoryItem>();
  for (const s of INITIAL_STORIES) {
    if (s.publicationStatus === 'published') {
      mergedById.set(s.id, s);
    }
  }
  for (const s of firestoreStories) {
    if (s.publicationStatus === 'published') {
      mergedById.set(s.id, s);
    }
  }

  const publishedStories = Array.from(mergedById.values());

  // 1. Prerender each published Story / Series / Video at its canonical route + Episode routes
  let generatedStoryPages = 0;
  let generatedEpisodePages = 0;
  const canonicalStoryUrls: Array<{ loc: string; lastmod: string; priority: string }> = [];
  const episodeUrls: Array<{ loc: string; lastmod: string; priority: string }> = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const story of publishedStories) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(story.id)) continue;
    const canonicalPath = getStoryPath(story);
    const storyHtml = renderStoryDocument(templateHtml, story, assetIndex);
    writeHtmlAtRoute(canonicalPath, storyHtml);
    generatedStoryPages += 1;

    // Also preserve legacy /story/<id> compatibility if canonical is /series/<id> or /video/<id>
    const legacyStoryPath = `/story/${encodeURIComponent(story.id)}`;
    if (canonicalPath !== legacyStoryPath) {
      writeHtmlAtRoute(legacyStoryPath, storyHtml);
    }

    const lastMod = (typeof story.updatedAt === 'string' && story.updatedAt ? story.updatedAt : today).slice(0, 10);
    canonicalStoryUrls.push({
      loc: `${SITE_ORIGIN}${canonicalPath}`,
      lastmod: lastMod,
      priority: '0.8',
    });

    for (const ep of story.episodes || []) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(ep.id)) continue;
      const epPath = getEpisodePath(ep);
      const epHtml = renderEpisodeDocument(templateHtml, story, ep, assetIndex);
      writeHtmlAtRoute(epPath, epHtml);
      generatedEpisodePages += 1;
      episodeUrls.push({
        loc: `${SITE_ORIGIN}${epPath}`,
        lastmod: lastMod,
        priority: '0.7',
      });
    }
  }

  // 2. Prerender all Section Pages & Policy/Info Pages (/stories, /audio-series, /videos, /premium, /free-stories, /about, /contact, etc.)
  let generatedSectionPages = 0;
  for (const spec of SECTION_AND_INFO_SEO_SPECS) {
    let initialHtml = '';
    let schemaType = 'CollectionPage';

    if (spec.route.view === 'page') {
      schemaType = 'WebPage';
      initialHtml = buildInfoInitialHtml(spec.route.page);
    } else {
      const cat = spec.route.view === 'all_stories' ? spec.route.category : 'all';
      const filtered = publishedStories.filter((s) => {
        if (cat === 'audio') return s.category === 'audio';
        if (cat === 'videos') return isVideoContent(s);
        if (cat === 'free') return (s.ticketPriceInr ?? 0) <= 0;
        if (cat === 'premium') return (s.ticketPriceInr ?? 0) > 0;
        return true;
      });
      initialHtml = buildSectionInitialHtml(spec.headingBn, spec.description, filtered);
    }

    const pageUrl = `${SITE_ORIGIN}${spec.path}`;
    const pageHtml = applySeoDocument(templateHtml, {
      langCode: 'bn',
      ogLocale: 'bn_IN',
      ogType: 'website',
      title: spec.title,
      description: spec.description,
      canonicalUrl: pageUrl,
      imageUrl: defaultOgImage,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': schemaType,
        name: spec.title,
        description: spec.description,
        url: pageUrl,
        inLanguage: ['bn', 'hi', 'en'],
        isPartOf: {
          '@type': 'WebSite',
          name: 'Goppo Kahini',
          url: SITE_ORIGIN,
        },
      },
      initialHtml,
    });
    writeHtmlAtRoute(spec.path, pageHtml);
    generatedSectionPages += 1;
  }

  // 3. Enrich Homepage dist/index.html with Splash Screen shell (no raw link flash) + sr-only crawler catalog
  const homeHtml = templateHtml.replace(
    /<div\s+id=["']?root["']?\s*><\/div>/i,
    buildHomepageInitialHtml(publishedStories),
  );
  fs.writeFileSync(TEMPLATE_PATH, homeHtml, 'utf8');

  // 4. Generate complete dist/sitemap.xml & dist/robots.txt
  const sitemapEntries = [
    `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}/`)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...SECTION_AND_INFO_SEO_SPECS.map(
      (spec) =>
        `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${spec.path}`)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${spec.changefreq}</changefreq>\n    <priority>${spec.priority}</priority>\n  </url>`,
    ),
    ...canonicalStoryUrls.map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
    ),
    ...episodeUrls.map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
    ),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

  const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt, 'utf8');

  console.log(
    `[prerender] Generated ${generatedSectionPages} section/info pages, ${generatedStoryPages} story/series/video pages, and ${generatedEpisodePages} episode pages (${firestoreStories.length} live from Firestore); updated dist/sitemap.xml (${sitemapEntries.length} URLs).`,
  );
}

runPrerender().catch((err) => {
  console.error('[prerender] Failed:', err);
  process.exit(1);
});
