import type { Ogp } from "../../types";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/api/ogp/oembed");

/** YouTube URL正規化 */
function normalizeYouTubeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    
    // youtu.be/VIDEO_ID
    if (u.hostname === 'youtu.be') {
      const videoId = u.pathname.slice(1);
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    
    // youtube.com/shorts/VIDEO_ID
    if (u.pathname.startsWith('/shorts/')) {
      const videoId = u.pathname.split('/')[2];
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    
    // m.youtube.com -> www.youtube.com
    if (u.hostname === 'm.youtube.com') {
      return url.replace('m.youtube.com', 'www.youtube.com');
    }
    
    return url;
  } catch {
    return null;
  }
}

/** YouTube oEmbed */
export async function fetchYouTubeOembed(inputUrl: string): Promise<Ogp | null> {
  try {
    const url = normalizeYouTubeUrl(inputUrl);
    if (!url) return null;
    logger.info("YouTube oEmbed request", { inputUrl, normalizedUrl: url });

    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

    const res = await fetch(endpoint, { 
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      logger.warn("YouTube oEmbed non-OK response", {
        inputUrl,
        normalizedUrl: url,
        status: res.status,
      });
      return null;
    }

    const data = (await res.json()) as any;

    const result: Ogp = {
      url: inputUrl,
      provider: "youtube",
      title: data?.title,
      description: data?.author_name,
      image: data?.thumbnail_url,
      siteName: "YouTube",
      favicon: "https://www.youtube.com/favicon.ico",
    };
    logger.info("YouTube oEmbed success", {
      inputUrl,
      title: result.title ?? null,
      hasImage: Boolean(result.image),
    });
    return result;
  } catch {
    logger.warn("YouTube oEmbed failed", { inputUrl });
    return null;
  }
}

/** 短縮URL対策（vm.tiktok.com 等） */
async function resolveRedirect(url: string) {
  try {
    // Validate URL format
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS for security
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed');
    }
    
    // Whitelist allowed domains to prevent SSRF
    const allowedDomains = [
      'tiktok.com',
      'www.tiktok.com', 
      'vm.tiktok.com',
      'instagram.com',
      'www.instagram.com'
    ];
    
    if (!allowedDomains.includes(parsedUrl.hostname)) {
      throw new Error('Domain not allowed');
    }
    
    const res = await fetch(url, { 
      redirect: "follow", 
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    return res.url || url;
  } catch {
    return url; // Return original URL if validation fails
  }
}

export async function fetchTikTokOembed(inputUrl: string): Promise<Ogp | null> {
  try {
    const url = await resolveRedirect(inputUrl);
    logger.info("TikTok oEmbed request", { inputUrl, resolvedUrl: url });

    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
      url
    )}`;

    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      logger.warn("TikTok oEmbed non-OK response", {
        inputUrl,
        resolvedUrl: url,
        status: res.status,
      });
      return null;
    }

    const data = (await res.json()) as any;

    const result: Ogp = {
      url,
      provider: "tiktok",
      title: data?.title,
      description: data?.author_name ? `@${data.author_name}` : undefined,
      image: data?.thumbnail_url,
      siteName: data?.provider_name ?? "TikTok",
      favicon: "https://www.tiktok.com/favicon.ico",
    };
    logger.info("TikTok oEmbed success", {
      inputUrl,
      resolvedUrl: url,
      title: result.title ?? null,
      hasImage: Boolean(result.image),
    });
    return result;
  } catch {
    logger.warn("TikTok oEmbed failed", { inputUrl });
    return null;
  }
}

function getMetaToken() {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) return null;
  return `${id}|${secret}`;
}

export async function fetchInstagramOembed(
  url: string
): Promise<Ogp | null> {
  try {
    const token = getMetaToken();
    if (!token) {
      logger.warn("Instagram oEmbed skipped (missing token)", { url });
      return null;
    }
    logger.info("Instagram oEmbed request", { url });

    const endpoint =
      `https://graph.facebook.com/v24.0/instagram_oembed?` +
      `url=${encodeURIComponent(url)}` +
      `&access_token=${encodeURIComponent(token)}` +
      `&omitscript=true`;

    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      logger.warn("Instagram oEmbed non-OK response", {
        url,
        status: res.status,
      });
      return null;
    }

    const data = (await res.json()) as any;

    const result: Ogp = {
      url,
      provider: "instagram",
      title: data?.title,
      description: data?.author_name ? `@${data.author_name}` : undefined,
      image: data?.thumbnail_url,
      siteName: data?.provider_name ?? "Instagram",
      favicon: "https://www.instagram.com/favicon.ico",
    };
    logger.info("Instagram oEmbed success", {
      url,
      title: result.title ?? null,
      hasImage: Boolean(result.image),
    });
    return result;
  } catch {
    logger.warn("Instagram oEmbed failed", { url });
    return null;
  }
}
