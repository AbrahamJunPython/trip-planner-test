import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { Ogp } from "../../types";
import { detectProvider } from "./provider";
import {
  fetchTikTokOembed,
  fetchInstagramOembed,
} from "./oembed";

function normalizeUrl(raw: string) {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function getFavicon(url: string) {
  try {
    const u = new URL(url);
    return `${u.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

function fallbackCard(url: string): Ogp {
  try {
    const u = new URL(url);
    return {
      url,
      title: u.hostname,
      siteName: u.hostname,
      favicon: `${u.origin}/favicon.ico`,
    };
  } catch {
    return { url };
  }
}

async function fetchHtml(url: string) {
  try {
    // Validate URL format and security
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS for security
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed');
    }
    
    // Block private/internal networks to prevent SSRF
    const hostname = parsedUrl.hostname;
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
      hostname.startsWith('169.254.') ||
      hostname === '0.0.0.0'
    ) {
      throw new Error('Private network access not allowed');
    }
    
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "ja,en;q=0.8",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    return res;
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function scrapeOgp(url: string): Promise<Ogp> {
  try {
    const res = await fetchHtml(url);
    if (!res.ok) return fallbackCard(url);

    const html = await res.text().catch((error) => {
      throw new Error(`Failed to read response text from ${url}: ${error.message}`);
    });
    const $ = cheerio.load(html);

    const og = (prop: string) =>
      $(`meta[property="${prop}"]`).attr("content")?.trim();

    const title =
      og("og:title") ||
      $("meta[name='twitter:title']").attr("content")?.trim() ||
      $("title").first().text().trim() ||
      undefined;

    const description =
      og("og:description") ||
      $("meta[name='description']").attr("content")?.trim() ||
      $("meta[name='twitter:description']").attr("content")?.trim() ||
      undefined;

    const image =
      og("og:image") ||
      $("meta[name='twitter:image']").attr("content")?.trim() ||
      undefined;

    const siteName =
      og("og:site_name") ||
      $("meta[name='twitter:site']").attr("content")?.trim() ||
      (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "Unknown Site";
        }
      })();

    // favicon（html内リンク優先）
    const iconHref =
      $("link[rel='icon']").attr("href") ||
      $("link[rel='shortcut icon']").attr("href") ||
      $("link[rel='apple-touch-icon']").attr("href") ||
      undefined;

    let favicon = getFavicon(url);
    if (iconHref) {
      try {
        favicon = new URL(iconHref, url).toString();
      } catch {}
    }

    // 何も取れないなら最低限返す
    if (!title && !description && !image) return fallbackCard(url);

    return { url, title, description, image, siteName, favicon };
  } catch (error) {
    console.error(`Error scraping OGP for ${url}:`, error);
    return fallbackCard(url);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];

    const cleaned = urls.map(normalizeUrl).filter((u): u is string => Boolean(u));

    const results = await Promise.all(
      cleaned.map(async (url) => {
        try {
          const provider = detectProvider(url);

          // ★ SNSは oEmbed 優先
          if (provider === "tiktok") {
            const o = await fetchTikTokOembed(url);
            if (o) return o;
          }

          if (provider === "instagram") {
            const o = await fetchInstagramOembed(url);
            if (o) return o;
          }

          // ★ ダメなら従来の scrape
          const scraped = await scrapeOgp(url);
          return { ...scraped, provider };
        } catch (error) {
          console.error(`Error processing URL ${url}:`, error);
          return fallbackCard(url);
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error('POST request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}