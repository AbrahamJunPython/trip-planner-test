import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { CLASSIFY_PLACE_SYSTEM_PROMPT, buildClassifyPlacePrompt } from "@/app/prompts/classify-place";
import { createLogger } from "@/app/lib/logger";
import type { Ogp } from "@/app/types";
import { createItemIdFromUrl } from "@/app/lib/item-tracking";
import { getClientIpHash, getDurationMs, isSlowDuration } from "@/app/lib/log-fields";

const logger = createLogger("/api/classify-place");

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const clientIpHash = getClientIpHash(req);
  let itemId: string | null = null;
  let flowId: string | null = null;
  try {
    const body = (await req.json().catch(() => null)) as Partial<Ogp> | null;
    const input: Partial<Ogp> = {
      url: typeof body?.url === "string" ? body.url : "",
      title: typeof body?.title === "string" ? body.title : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      image: typeof body?.image === "string" ? body.image : undefined,
      siteName: typeof body?.siteName === "string" ? body.siteName : undefined,
      favicon: typeof body?.favicon === "string" ? body.favicon : undefined,
      provider: body?.provider,
    };
    itemId =
      typeof (body as Record<string, unknown> | null)?.item_id === "string"
        ? ((body as Record<string, unknown>).item_id as string)
        : createItemIdFromUrl(input.url || "");
    flowId =
      typeof (body as Record<string, unknown> | null)?.flow_id === "string"
        ? ((body as Record<string, unknown>).flow_id as string)
        : null;
    const { title, description, url } = input;

    logger.info("Classify request received", {
      hasTitle: Boolean(title),
      hasDescription: Boolean(description),
      hasImage: Boolean(input.image),
      siteName: input.siteName ?? null,
      provider: input.provider ?? null,
      url,
      itemId,
      flowId,
      flow_id: flowId,
      item_id: itemId,
    });

    if (!openai) {
      const fallback = {
        category: "visit",
        name: title || "",
        address: ""
      };
      logger.warn("OpenAI key missing, returning fallback classify result", {
        duration: `${getDurationMs(startTime)}ms`,
        duration_ms: getDurationMs(startTime),
        status: 503,
        error_code: "classify_openai_unavailable",
        dependency: "openai",
        flow_id: flowId,
        item_id: itemId,
        client_ip_hash: clientIpHash,
        itemId,
        flowId,
        result: fallback,
      });
      return NextResponse.json(fallback);
    }

    const prompt = CLASSIFY_PLACE_SYSTEM_PROMPT + "\n\n" + buildClassifyPlacePrompt(input);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const durationMs = getDurationMs(startTime);
    logger.info("Classify response generated", {
      duration: `${durationMs}ms`,
      duration_ms: durationMs,
      itemId,
      flowId,
      flow_id: flowId,
      item_id: itemId,
      result,
    });
    if (isSlowDuration(durationMs)) {
      logger.warn("Classify API slow response", {
        endpoint: "/api/classify-place",
        duration_ms: durationMs,
        flow_id: flowId,
        item_id: itemId,
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    const durationMs = getDurationMs(startTime);
    const message = error instanceof Error ? error.message : "unknown_error";
    const fallback = { category: "visit", name: "", prefecture: "", address: "", pasted_url: null, corrected_url: null };
    logger.error("Classify error", error as Error, {
      duration: `${durationMs}ms`,
      duration_ms: durationMs,
      status: 500,
      error_code: "classify_request_failed",
      endpoint: "/api/classify-place",
      itemId,
      flowId,
      flow_id: flowId,
      item_id: itemId,
      dependency: "openai",
      timeout: /timeout/i.test(message),
      retry_count: null,
      client_ip_hash: clientIpHash,
      fallback,
    });
    return NextResponse.json(
      fallback,
      { status: 200 }
    );
  }
}
