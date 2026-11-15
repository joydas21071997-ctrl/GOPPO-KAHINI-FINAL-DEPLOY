import fs from 'node:fs';
import path from 'node:path';
import { INITIAL_STORIES } from '../server/catalogSeed.ts';
import type { StoryItem } from '../src/types/content.ts';

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
        `<strong>${escapeHtml(ep.title)}</strong>` +
        (ep.durationLabel ? ` <span style="opacity:0.75;">(${escapeHtml(ep.durationLabel)})</span>` : '') +
        (ep.synopsis ? `<p style="margin:4px 0 0;opacity:0.8;font-size:14px;">${escapeHtml(ep.synopsis)}</p>` : '') +
        `</li>`,
    )
    .join('');

  return (
    `<div id="root"><div class="min-h-screen bg-[#09080B] text-[#F5F2EB]" style="max-width:960px;margin:0 auto;padding:24px 16px;font-family:sans-serif;">` +
    `<header style="margin-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:12px;">` +
    `<a href="/" style="color:#EF4444;text-decoration:none;font-weight:700;font-size:18px;">Goppo Kahini</a>` +
    `</header>` +
    `<main>` +
    `<article>` +
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
    `</div>` +
    `</div>` +
    (episodesList
      ? `<section style="margin-top:28px;"><h2 style="font-size:20px;margin-bottom:12px;">Episodes</h2><ul style="list-style:none;padding:0;margin:0;">${episodesList}</ul></section>`
      : '') +
    `</article>` +
    `</main>` +
    `</div></div>`
  );
}

function buildHomepageInitialHtml(stories: StoryItem[]): string {
  const storyLinks = stories
    .map(
      (s) =>
        `<li style="margin-bottom:8px;">` +
        `<a href="/story/${encodeURIComponent(s.id)}" style="color:#F5F2EB;text-decoration:underline;">` +
        `${escapeHtml(s.title)}` +
        `</a>` +
        (s.subtitle ? ` — <span style="opacity:0.78;">${escapeHtml(s.subtitle)}</span>` : '') +
        `</li>`,
    )
    .join('');

  return (
    `<div id="root"><div class="min-h-screen bg-[#09080B] text-[#F5F2EB]" style="max-width:1100px;margin:0 auto;padding:28px 16px;font-family:sans-serif;">` +
    `<header style="margin-bottom:24px;">` +
    `<h1 style="font-size:32px;margin:0 0 8px;color:#F5F2EB;">Goppo Kahini — Bengali &amp; Hindi Audio Stories, Animation &amp; Films</h1>` +
    `<p style="font-size:15px;color:#D6CEC7;margin:0;">Stream original Bengali and Hindi audio stories, animations, and films on Goppo Kahini. Listen to free previews or unlock ad-free stories anytime.</p>` +
    `</header>` +
    `<main><section><h2 style="font-size:20px;margin:0 0 12px;color:#EF4444;">Featured Catalog</h2><ul style="list-style:none;padding:0;margin:0;">${storyLinks}</ul></section></main>` +
    `</div></div>`
  );
}

function truncateDescription(raw: string, maxLen = 158): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim() + '…';
}

function renderStoryDocument(templateHtml: string, story: StoryItem, assetIndex: Map<string, string>): string {
  const storyUrl = `${SITE_ORIGIN}/story/${encodeURIComponent(story.id)}`;
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

  const storyJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: story.title,
    headline: story.subtitle || story.title,
    description: story.synopsis,
    url: storyUrl,
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
  });

  let html = templateHtml;
  html = replaceMetaTag(html, /<html\s+lang="[^"]*"/i, `<html lang="${langCode}"`);
  html = replaceMetaTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(titleText)}</title>`);
  html = replaceMetaTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(descriptionText)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(storyUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="article" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(storyUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(titleText)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(descriptionText)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:locale"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:locale" content="${ogLocale}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(titleText)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(descriptionText)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`,
  );
  html = replaceMetaTag(
    html,
    /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">${storyJsonLd}</script>`,
  );

  // Remove the ?story= inline canonical fallback on prerendered /story/<id> pages
  html = html.replace(/<script>\s*\(function \(\) \{[\s\S]*?querySelector\('link\[rel="canonical"\]'\)[\s\S]*?<\/script>/i, '');

  const initialStoryHtml = buildStoryInitialHtml(story, imageUrl);
  html = html.replace(/<div\s+id=["']?root["']?\s*><\/div>/i, initialStoryHtml);

  return html;
}

async function runPrerender() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Missing built dist/index.html at ${TEMPLATE_PATH}. Run vite build first.`);
  }

  const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const assetIndex = buildAssetFileIndex();
  const firestoreStories = await fetchPublishedStoriesFromFirestore();

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

  // 1. Prerender each published story into dist/story/<id>/index.html
  let generatedCount = 0;
  for (const story of publishedStories) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(story.id)) continue;
    const storyDir = path.join(DIST_DIR, 'story', story.id);
    fs.mkdirSync(storyDir, { recursive: true });
    const renderedHtml = renderStoryDocument(templateHtml, story, assetIndex);
    fs.writeFileSync(path.join(storyDir, 'index.html'), renderedHtml, 'utf8');
    generatedCount += 1;
  }

  // 2. Enrich Homepage dist/index.html with initial catalog HTML + story links for crawlers
  const homeHtml = templateHtml.replace(
    /<div\s+id=["']?root["']?\s*><\/div>/i,
    buildHomepageInitialHtml(publishedStories),
  );
  fs.writeFileSync(TEMPLATE_PATH, homeHtml, 'utf8');

  // 3. Generate up-to-date dist/sitemap.xml & dist/robots.txt
  const today = new Date().toISOString().slice(0, 10);
  const sitemapEntries = [
    `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}/`)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...publishedStories.map((story) => {
      const lastMod = (typeof story.updatedAt === 'string' && story.updatedAt ? story.updatedAt : today).slice(0, 10);
      const loc = `${SITE_ORIGIN}/story/${encodeURIComponent(story.id)}`;
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${escapeXml(lastMod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

  const robotsTxt = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt, 'utf8');

  console.log(
    `[prerender] Generated ${generatedCount} static story SEO pages (${firestoreStories.length} live from Firestore) and updated dist/sitemap.xml.`,
  );
}

runPrerender().catch((err) => {
  console.error('[prerender] Failed:', err);
  process.exit(1);
});
