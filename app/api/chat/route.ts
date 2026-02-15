import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createLogger, logOpenAICall, logOpenAIResponse } from "@/app/lib/logger";
import { CHAT_SYSTEM_PROMPT, buildChatUserPrompt } from "@/app/prompts/chat";
import { fetchOpenAIWithRetry } from "@/app/lib/retry";
import { getCircuitBreaker } from "@/app/lib/circuit-breaker";
import { fetchWithCache } from "@/app/lib/cache";
import { getRateLimiter } from "@/app/lib/rate-limiter";
import { chatRequestSchema, validateRequest } from "@/app/lib/validation";
import { createItemIdFromUrl } from "@/app/lib/item-tracking";
import { getClientIpHash, getDurationMs, isSlowDuration } from "@/app/lib/log-fields";

const logger = createLogger("/api/chat");
const openaiBreaker = getCircuitBreaker("openai-chat", {
  failureThreshold: 3,
  resetTimeout: 30000,
});
const rateLimiter = getRateLimiter("openai-chat", {
  maxTokens: 10,
  refillRate: 1,
  refillInterval: 1000,
});

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    return u.toString();
  } catch {
    return raw.trim();
  }
}

function buildIntegratedContextSnippet(params: {
  placeUrl: string;
  integratedContext?: {
    schemaVersion?: string | null;
    flowId?: string | null;
    depart?: {
      selected?: string | null;
      mode?: string | null;
      coords?: { lat: number; lon: number } | null;
      locationInfo?: {
        latitude?: number | null;
        longitude?: number | null;
        postcode?: string | null;
        city?: string | null;
        prefecture?: string | null;
      } | null;
    } | null;
    items?: Array<{
      item_id?: string;
      normalized_url?: string;
      ogp?: {
        url?: string;
        provider?: string | null;
      } | null;
      classify_place?: {
        category?: string | null;
        name?: string | null;
        address?: string | null;
      } | null;
      geocode?: {
        latitude?: number | null;
        longitude?: number | null;
      } | null;
    }>;
  } | null;
}): string {
  const ctx = params.integratedContext;
  if (!ctx || !Array.isArray(ctx.items)) return "";

  const currentNormalizedUrl = normalizeUrl(params.placeUrl);
  const currentItem =
    ctx.items.find((item) => normalizeUrl(item.ogp?.url ?? "") === currentNormalizedUrl) ??
    null;

  const relatedItems = ctx.items
    .filter((item) => normalizeUrl(item.ogp?.url ?? "") !== currentNormalizedUrl)
    .slice(0, 5)
    .map((item) => ({
      category: item.classify_place?.category ?? null,
      name: item.classify_place?.name ?? null,
      latitude: item.geocode?.latitude ?? null,
      longitude: item.geocode?.longitude ?? null,
    }));

  return JSON.stringify({
    schemaVersion: ctx.schemaVersion,
    flowId: ctx.flowId,
    depart: ctx.depart,
    currentItem: currentItem
      ? {
          item_id: currentItem.item_id,
          category: currentItem.classify_place?.category ?? null,
          name: currentItem.classify_place?.name ?? null,
          address: currentItem.classify_place?.address ?? null,
          latitude: currentItem.geocode?.latitude ?? null,
          longitude: currentItem.geocode?.longitude ?? null,
          provider: currentItem.ogp.provider ?? null,
        }
      : null,
    relatedItems,
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let flowId: string | null = null;
  let itemId: string | null = null;
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      logger.error("OpenAI API key not configured", undefined, {
        status: 500,
        error_code: "openai_api_key_missing",
        dependency: "openai",
        flow_id: flowId,
        item_id: itemId,
      });
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      logger.warn("Chat request rejected", {
        status: 400,
        error_code: "invalid_json_body",
        reason: "request_body_json_parse_failed",
        expected_version: "chat-request-v1",
        received_version: null,
        flow_id: null,
        item_id: null,
        client_ip_hash: getClientIpHash(req),
      });
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success && "errors" in validation) {
      const receivedVersion =
        typeof (body as Record<string, unknown>).integratedContext === "object" &&
        (body as Record<string, unknown>).integratedContext !== null &&
        typeof ((body as Record<string, unknown>).integratedContext as Record<string, unknown>)
          .schemaVersion === "string"
          ? (((body as Record<string, unknown>).integratedContext as Record<string, unknown>)
              .schemaVersion as string)
          : null;
      logger.warn("Invalid chat request", {
        status: 400,
        error_code: "invalid_chat_request_schema",
        reason: "schema_validation_failed",
        expected_version: "chat-request-v1",
        received_version: receivedVersion,
        client_ip_hash: getClientIpHash(req),
        issues: validation.errors.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 }
      );
    }

    if (!("data" in validation)) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 }
      );
    }

    const { place, context, ogpData, integratedContext } = validation.data;
    flowId = integratedContext?.flowId ?? null;
    itemId = createItemIdFromUrl(place.url);
    
    logger.info("Chat request received", {
      placeName: place.name,
      placeCategory: place.category,
      hasOgpData: !!ogpData,
      hasIntegratedContext: Boolean(integratedContext),
      integratedItemCount: integratedContext?.items?.length ?? 0,
      flowId: integratedContext?.flowId ?? null,
      flow_id: flowId,
      item_id: itemId,
    });

    const integratedContextSnippet = buildIntegratedContextSnippet({
      placeUrl: place.url,
      integratedContext,
    });
    const userPrompt = buildChatUserPrompt({
      name: place.name,
      address: place.address,
      category: place.category,
      url: place.url,
      depart: context.depart,
      additionalContext: integratedContextSnippet || undefined,
    });

    logOpenAICall({
      endpoint: "/api/chat",
      model: "gpt-4o-mini",
      prompt: CHAT_SYSTEM_PROMPT + "\n\n" + userPrompt,
      maxTokens: 300,
      temperature: 0.7,
    });

    // Cache key
    const cacheKey = {
      place: place.url,
      depart: context.depart,
      flowId: integratedContext?.flowId ?? null,
      schemaVersion: integratedContext?.schemaVersion ?? null,
    };

    // Rate limit + Circuit breaker + Retry + Cache
    const result = await fetchWithCache(
      cacheKey,
      async () => {
        try {
          await rateLimiter.acquire();
        } catch (rateLimitError) {
          logger.warn("Rate limiter rejected chat request", {
            limiter: "openai-chat",
            endpoint: "/api/chat",
            flow_id: flowId,
            item_id: itemId,
            status: 429,
            error_code: "rate_limited",
            reason: (rateLimitError as Error)?.message ?? "rate_limiter_acquire_failed",
          });
          throw rateLimitError;
        }
        
        return openaiBreaker.execute(() =>
          fetchOpenAIWithRetry(process.env.OPENAI_API_KEY!, {
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: CHAT_SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 300,
            response_format: { type: "json_object" },
          })
        );
      },
      { cacheName: "chat", ttl: 10 * 60 * 1000 } // 10 minutes
    );

    const reply = result.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(reply);
    
    logOpenAIResponse({
      endpoint: "/api/chat",
      success: true,
      response: parsed,
      duration: getDurationMs(startTime),
    });

    const durationMs = getDurationMs(startTime);
    if (isSlowDuration(durationMs)) {
      logger.warn("Chat API slow response", {
        endpoint: "/api/chat",
        duration_ms: durationMs,
        flow_id: flowId,
        item_id: itemId,
      });
    }

    return NextResponse.json({
      facilityName: parsed.facilityName || place.name,
      description: parsed.description || "情報を取得できませんでした。",
      address: parsed.address || place.address,
      latitude: parsed.latitude || null,
      longitude: parsed.longitude || null,
      officialUrl: parsed.officialUrl || place.url,
      sourceUrl: place.url,
      category: place.category,
      ogp: ogpData || null
    });
  } catch (error) {
    const duration = getDurationMs(startTime);
    const message = error instanceof Error ? error.message : "unknown_error";
    logger.error("Chat API error", error as Error, {
      duration,
      duration_ms: duration,
      status: 500,
      error_code: "chat_api_failed",
      endpoint: "/api/chat",
      flow_id: flowId,
      item_id: itemId,
      dependency: "openai",
      retry_count: null,
      timeout: /timeout/i.test(message),
      client_ip_hash: getClientIpHash(req),
    });
    
    logOpenAIResponse({
      endpoint: "/api/chat",
      success: false,
      error: error as Error,
      duration,
    });
    
    return NextResponse.json(
      { error: "情報取得中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
