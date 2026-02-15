import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { Ogp } from "../../types";
import { createLogger } from "@/app/lib/logger";
import { detectProvider } from "./provider";
import {
  fetchTikTokOembed,
  fetchInstagramOembed,
  fetchYouTubeOembed,
} from "./oembed";

const logger = createLogger("/api/ogp");

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

function summarizeResult(result: Ogp) {
  return {
    url: result.url,
    provider: result.provider ?? "website",
    title: result.title?.slice(0, 80) ?? null,
    hasDescription: Boolean(result.description),
    hasImage: Boolean(result.image),
    siteName: result.siteName ?? null,
  };
}

async function fetchHtml(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "https:") {
      throw new Error("Only HTTPS URLs are allowed");
    }

    const hostname = parsedUrl.hostname;
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
      hostname.startsWith("169.254.") ||
      hostname === "0.0.0.0"
    ) {
      throw new Error("Private network access not allowed");
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
      signal: AbortSignal.timeout(10000),
    });
    return res;
  } catch (error) {
    throw new Error(
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
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

    const og = (prop: string) => $(`meta[property="${prop}"]`).attr("content")?.trim();

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

    const iconHref =
      $("link[rel='icon']").attr("href") ||
      $("link[rel='shortcut icon']").attr("href") ||
      $("link[rel='apple-touch-icon']").attr("href") ||
      undefined;

    let favicon = getFavicon(url);
    if (iconHref) {
      try {
        favicon = new URL(iconHref, url).toString();
      } catch {
        logger.debug("Failed to normalize favicon URL", { url, iconHref });
      }
    }

    if (!title && !description && !image) return fallbackCard(url);

    return { url, title, description, image, siteName, favicon };
  } catch (error) {
    logger.error(`Error scraping OGP for ${url}`, error as Error);
    return fallbackCard(url);
  }
}

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => null);
    const urls: string[] = Array.isArray(body?.urls) ? body.urls : [];

    logger.info("OGP request received", {
      inputUrlCount: urls.length,
      inputUrls: urls,
    });

    const cleaned = urls.map(normalizeUrl).filter((u): u is string => Boolean(u));
    if (cleaned.length !== urls.length) {
      logger.warn("Some URLs were dropped during normalization", {
        inputUrlCount: urls.length,
        normalizedUrlCount: cleaned.length,
      });
    }

    const results = await Promise.all(
      cleaned.map(async (url) => {
        try {
          const provider = detectProvider(url);
          logger.info("Processing OGP URL", { url, provider });

          if (provider === "youtube") {
            const o = await fetchYouTubeOembed(url);
            if (o) {
              logger.info("OGP URL processed via YouTube oEmbed", {
                url,
                result: summarizeResult(o),
              });
              return o;
            }
          }

          if (provider === "tiktok") {
            const o = await fetchTikTokOembed(url);
            if (o) {
              logger.info("OGP URL processed via TikTok oEmbed", {
                url,
                result: summarizeResult(o),
              });
              return o;
            }
          }

          if (provider === "instagram") {
            const o = await fetchInstagramOembed(url);
            if (o) {
              logger.info("OGP URL processed via Instagram oEmbed", {
                url,
                result: summarizeResult(o),
              });
              return o;
            }
          }

          const scraped = { ...(await scrapeOgp(url)), provider };
          logger.info("OGP URL processed via HTML scraping", {
            url,
            result: summarizeResult(scraped),
          });
          return scraped;
        } catch (error) {
          const fallback = fallbackCard(url);
          logger.error(`Error processing URL ${url}`, error as Error, {
            fallback: summarizeResult(fallback),
          });
          return fallback;
        }
      })
    );

    logger.info("OGP response generated", {
      duration: `${Date.now() - startTime}ms`,
      resultCount: results.length,
      results: results.map(summarizeResult),
    });

    return NextResponse.json({ results });
  } catch (error) {
    logger.error("POST request error", error as Error, {
      duration: `${Date.now() - startTime}ms`,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
