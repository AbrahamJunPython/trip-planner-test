import type { Ogp } from "../../types";

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

    const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
      url
    )}`;

    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return null;

    const data = (await res.json()) as any;

    return {
      url,
      provider: "tiktok",
      title: data?.title,
      description: data?.author_name ? `@${data.author_name}` : undefined,
      image: data?.thumbnail_url,
      siteName: data?.provider_name ?? "TikTok",
      favicon: "https://www.tiktok.com/favicon.ico",
    };
  } catch {
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
    if (!token) return null;

    const endpoint =
      `https://graph.facebook.com/instagram_oembed?` +
      `url=${encodeURIComponent(url)}` +
      `&access_token=${encodeURIComponent(token)}` +
      `&omitscript=true`;

    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return null;

    const data = (await res.json()) as any;

    return {
      url,
      provider: "instagram",
      title: data?.title,
      description: data?.author_name ? `@${data.author_name}` : undefined,
      image: data?.thumbnail_url,
      siteName: data?.provider_name ?? "Instagram",
      favicon: "https://www.instagram.com/favicon.ico",
    };
  } catch {
    return null;
  }
}