import type { IdeaLinkPreview } from '@shared/types';
import { Directory, File, Paths } from 'expo-file-system';

type Provider = NonNullable<IdeaLinkPreview['provider']>;

export function detectProvider(url: string): Provider {
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  return 'generic';
}

export function isLikelyUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|www\.)\S+$/i.test(trimmed) || /\.[a-z]{2,}\/?/i.test(trimmed);
}

export function extractUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const explicit = text.match(/https?:\/\/[^\s<>"']+/i);
  if (explicit) return explicit[0];
  const www = text.match(/www\.[^\s<>"']+/i);
  if (www) return `https://${www[0]}`;
  const bare = text.match(
    /\b[a-z0-9-]+\.(?:com|net|org|io|app|tv|co|me|ai|dev|xyz|ly|gg|so|link)(?:\/[^\s<>"']*)?/i
  );
  if (bare) return `https://${bare[0]}`;
  return null;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

interface OEmbedResponse {
  title?: string;
  thumbnail_url?: string;
  author_name?: string;
  provider_name?: string;
}

const OEMBED_ENDPOINTS: Partial<Record<Provider, (url: string) => string>> = {
  youtube: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  tiktok: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  twitter: (url) =>
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`,
};

// A browser-like UA gets served public OG tags from sites that block generic fetches.
const SCRAPER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15';

// Instagram's main post pages show a login wall to anonymous clients, but
// /p/<code>/embed/ is intended for iframes and serves OG tags + an inline <img>.
function instagramEmbedUrl(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i);
  if (!match) return null;
  return `https://www.instagram.com/p/${match[1]}/embed/`;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 6000
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function parseOgFromHtml(html: string): IdeaLinkPreview {
  // Instagram/Facebook serve <meta> tags with either order: property-then-content
  // or content-then-property. We try both and also fall back to inline <img> tags.
  const meta = (property: string): string | undefined => {
    const esc = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const forward = new RegExp(
      `<meta[^>]+(?:property|name)=["']${esc}["'][^>]*?\\scontent=["']([^"']*)["']`,
      'i'
    );
    const backward = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*?\\s(?:property|name)=["']${esc}["']`,
      'i'
    );
    const match = html.match(forward) ?? html.match(backward);
    return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
  };

  let thumbnail = meta('og:image') ?? meta('og:image:url') ?? meta('twitter:image');
  if (!thumbnail) {
    // Instagram's embed page sometimes drops og:image but keeps the photo inline.
    const imgMatch = html.match(
      /<img[^>]+src=["']([^"']*(?:cdninstagram|fbcdn|ytimg|pinimg|tiktokcdn)[^"']*)["']/i
    );
    if (imgMatch?.[1]) thumbnail = decodeHtmlEntities(imgMatch[1]);
  }

  return {
    title: meta('og:title') ?? meta('twitter:title'),
    thumbnail,
    author: meta('og:site_name') ?? meta('twitter:creator') ?? meta('author'),
  };
}

export async function fetchLinkPreview(rawUrl: string): Promise<IdeaLinkPreview> {
  const url = normalizeUrl(rawUrl);
  const provider = detectProvider(url);
  const preview: IdeaLinkPreview = { provider };

  const oembedBuilder = OEMBED_ENDPOINTS[provider];
  if (oembedBuilder) {
    const response = await fetchWithTimeout(oembedBuilder(url));
    if (response) {
      try {
        const data = (await response.json()) as OEmbedResponse;
        if (data.title) preview.title = data.title;
        if (data.thumbnail_url) preview.thumbnail = data.thumbnail_url;
        if (data.author_name) preview.author = data.author_name;
      } catch {
        // ignore — fall back to OG below
      }
    }
  }

  if (!preview.title || !preview.thumbnail) {
    const scrapeTargets: string[] = [];
    if (provider === 'instagram') {
      const embed = instagramEmbedUrl(url);
      if (embed) scrapeTargets.push(embed);
    }
    scrapeTargets.push(url);

    for (const target of scrapeTargets) {
      if (preview.title && preview.thumbnail) break;
      const response = await fetchWithTimeout(target, {
        headers: {
          'User-Agent': SCRAPER_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (!response) continue;
      try {
        const html = await response.text();
        const og = parseOgFromHtml(html);
        preview.title = preview.title ?? og.title;
        preview.thumbnail = preview.thumbnail ?? og.thumbnail;
        preview.author = preview.author ?? og.author;
      } catch {
        // ignore
      }
    }
  }

  return preview;
}

const THUMB_DIR_NAME = 'idea_thumbs';

function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

function getThumbDir(): Directory {
  const dir = new Directory(Paths.document, THUMB_DIR_NAME);
  if (!dir.exists) dir.create();
  return dir;
}

async function downloadToFile(remoteUrl: string, destFile: File): Promise<void> {
  try {
    await File.downloadFileAsync(remoteUrl, destFile);
    if (destFile.exists) return;
  } catch {
    // fall through to manual fetch
  }
  const response = await fetch(remoteUrl);
  if (!response.ok) throw new Error(`thumbnail fetch failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  destFile.write(new Uint8Array(buffer));
}

export async function cachePreviewThumbnail(
  remoteUrl: string,
  ideaId: string
): Promise<string | null> {
  if (!isRemoteUrl(remoteUrl)) return remoteUrl;
  try {
    const dir = getThumbDir();
    const destFile = new File(dir, `${ideaId}.jpg`);
    if (destFile.exists) {
      try {
        await destFile.delete();
      } catch {
        // ignore — downloadFileAsync will overwrite
      }
    }
    await downloadToFile(remoteUrl, destFile);
    return destFile.exists ? destFile.uri : null;
  } catch {
    return null;
  }
}

export async function fetchPreviewWithCache(url: string, ideaId: string): Promise<IdeaLinkPreview> {
  const preview = await fetchLinkPreview(url);
  if (preview.thumbnail && isRemoteUrl(preview.thumbnail)) {
    const localUri = await cachePreviewThumbnail(preview.thumbnail, ideaId);
    if (localUri) return { ...preview, thumbnail: localUri };
  }
  return preview;
}

export async function deleteCachedThumbnail(uri: string | undefined | null): Promise<void> {
  if (!uri) return;
  if (isRemoteUrl(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) await file.delete();
  } catch {
    // ignore
  }
}
