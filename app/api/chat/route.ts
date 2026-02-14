import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createLogger, logOpenAICall, logOpenAIResponse } from "@/app/lib/logger";
import { CHAT_SYSTEM_PROMPT, buildChatUserPrompt } from "@/app/prompts/chat";
import { fetchOpenAIWithRetry } from "@/app/lib/retry";
import { getCircuitBreaker } from "@/app/lib/circuit-breaker";
import { fetchWithCache } from "@/app/lib/cache";
import { getRateLimiter } from "@/app/lib/rate-limiter";
import { chatRequestSchema, validateRequest } from "@/app/lib/validation";

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

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      logger.error("OpenAI API key not configured");
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validation = validateRequest(chatRequestSchema, body);
    if (!validation.success && "errors" in validation) {
      logger.warn("Invalid chat request", {
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

    const { place, context, ogpData } = validation.data;
    
    logger.info("Chat request received", {
      placeName: place.name,
      placeCategory: place.category,
      hasOgpData: !!ogpData,
    });

    const userPrompt = buildChatUserPrompt({
      name: place.name,
      address: place.address,
      category: place.category,
      url: place.url,
      depart: context.depart,
    });

    logOpenAICall({
      endpoint: "/api/chat",
      model: "gpt-4o-mini",
      prompt: CHAT_SYSTEM_PROMPT + "\n\n" + userPrompt,
      maxTokens: 300,
      temperature: 0.7,
    });

    // Cache key
    const cacheKey = { place: place.url, depart: context.depart };

    // Rate limit + Circuit breaker + Retry + Cache
    const result = await fetchWithCache(
      cacheKey,
      async () => {
        await rateLimiter.acquire();
        
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
      duration: Date.now() - startTime,
    });

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
    const duration = Date.now() - startTime;
    logger.error("Chat API error", error as Error, { duration });
    
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
