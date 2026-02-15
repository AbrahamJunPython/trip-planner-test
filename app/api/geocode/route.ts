import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/app/lib/logger";
import { fetchWithCache } from "@/app/lib/cache";
import { createItemIdFromUrl } from "@/app/lib/item-tracking";
import { getClientIpHash, getDurationMs, isSlowDuration } from "@/app/lib/log-fields";

const logger = createLogger("/api/geocode");

function normalizeAddress(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const clientIpHash = getClientIpHash(req);
  let itemId: string | null = null;
  let flowId: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    const address = normalizeAddress(body?.address);
    const sourceUrl = normalizeAddress(body?.source_url);
    itemId =
      typeof body?.item_id === "string"
        ? body.item_id
        : sourceUrl
          ? createItemIdFromUrl(sourceUrl)
          : null;
    flowId = typeof body?.flow_id === "string" ? body.flow_id : null;
    if (!address) {
      logger.warn("Geocode request rejected", {
        duration: `${getDurationMs(startTime)}ms`,
        duration_ms: getDurationMs(startTime),
        reason: "address is required",
        error_code: "geocode_address_required",
        status: 400,
        itemId,
        flowId,
        flow_id: flowId,
        item_id: itemId,
        client_ip_hash: clientIpHash,
      });
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    logger.info("Geocode request received", {
      address,
      sourceUrl: sourceUrl || null,
      itemId,
      flowId,
      flow_id: flowId,
      item_id: itemId,
    });

    const result = await fetchWithCache(
      { address: address.toLowerCase() },
      async () => {
        const endpoint =
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}` +
          `&limit=1&accept-language=ja`;

        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            "User-Agent": "trip-planner-mvp/1.0",
            Accept: "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
          const err = new Error(`Nominatim error: ${response.status}`);
          (err as Error & { status?: number }).status = response.status;
          throw err;
        }

        const list = (await response.json().catch(() => [])) as Array<{
          lat?: string;
          lon?: string;
          display_name?: string;
        }>;

        const first = list[0];
        const lat = first?.lat ? Number(first.lat) : null;
        const lon = first?.lon ? Number(first.lon) : null;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return {
            latitude: null,
            longitude: null,
            displayName: first?.display_name ?? null,
          };
        }

        return {
          latitude: lat,
          longitude: lon,
          displayName: first?.display_name ?? null,
        };
      },
      { cacheName: "geocode", ttl: 24 * 60 * 60 * 1000 }
    );

    const durationMs = getDurationMs(startTime);
    logger.info("Geocode response generated", {
      duration: `${durationMs}ms`,
      duration_ms: durationMs,
      hasCoordinates: result.latitude !== null && result.longitude !== null,
      itemId,
      flowId,
      flow_id: flowId,
      item_id: itemId,
      result,
    });
    if (isSlowDuration(durationMs)) {
      logger.warn("Geocode API slow response", {
        endpoint: "/api/geocode",
        duration_ms: durationMs,
        flow_id: flowId,
        item_id: itemId,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const durationMs = getDurationMs(startTime);
    const status =
      typeof (error as Error & { status?: unknown })?.status === "number"
        ? ((error as Error & { status: number }).status as number)
        : 500;
    const message = error instanceof Error ? error.message : "unknown_error";
    const fallback = { latitude: null, longitude: null, displayName: null };
    logger.error("Geocode request failed", error as Error, {
      duration: `${durationMs}ms`,
      duration_ms: durationMs,
      status,
      error_code: "geocode_request_failed",
      endpoint: "/api/geocode",
      itemId,
      flowId,
      flow_id: flowId,
      item_id: itemId,
      dependency: "nominatim",
      timeout: /timeout/i.test(message),
      retry_count: null,
      client_ip_hash: clientIpHash,
      result: fallback,
    });
    return NextResponse.json(
      fallback,
      { status: 200 }
    );
  }
}
