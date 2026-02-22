import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/app/lib/logger";
import { getClientIpHash, getDurationMs, isSlowDuration } from "@/app/lib/log-fields";

const logger = createLogger("/api/client-log");

type ClientLogEvent = {
  eventType:
    | "page_view"
    | "start_button_click"
    | "ai_consult_click"
    | "item_stage"
    | "ai_consult_snapshot"
    | "reservation_click";
  page: string;
  targetUrl?: string;
  timestamp?: string;
  referrer?: string;
  session_id?: string;
  user_id?: string;
  device_id?: string;
  metadata?: Record<string, unknown>;
};

function isValidEventType(value: unknown): value is ClientLogEvent["eventType"] {
  return (
    value === "page_view" ||
    value === "start_button_click" ||
    value === "ai_consult_click" ||
    value === "item_stage" ||
    value === "ai_consult_snapshot" ||
    value === "reservation_click"
  );
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = (await req.json().catch(() => null)) as ClientLogEvent | null;
    const durationMs = getDurationMs(startTime);
    const clientIpHash = getClientIpHash(req);
    const receivedEventType =
      body && typeof body.eventType === "string" ? body.eventType : null;
    const metadata =
      body && typeof body.metadata === "object" && body.metadata !== null
        ? body.metadata
        : null;
    const topLevelFlowId =
      body && typeof (body as Record<string, unknown>).flow_id === "string"
        ? ((body as Record<string, unknown>).flow_id as string)
        : null;
    const flowId =
      topLevelFlowId ??
      (metadata && typeof metadata.flow_id === "string" ? metadata.flow_id : null);
    const itemId =
      metadata && typeof metadata.item_id === "string" ? metadata.item_id : null;

    if (!body || !isValidEventType(body.eventType) || typeof body.page !== "string") {
      logger.warn("Client log request rejected", {
        duration: `${durationMs}ms`,
        duration_ms: durationMs,
        error_code: "invalid_client_log_payload",
        status: 400,
        reason: "invalid_payload",
        expected_version: "client-log-event-v1",
        received_version: null,
        received_event_type: receivedEventType,
        flow_id: flowId,
        item_id: itemId,
        client_ip_hash: clientIpHash,
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    logger.info("Client event received", {
      eventType: body.eventType,
      page: body.page,
      targetUrl: body.targetUrl ?? null,
      clientTimestamp: body.timestamp ?? null,
      referrer: body.referrer ?? null,
      sessionId: body.session_id ?? null,
      userId: body.user_id ?? null,
      deviceId: body.device_id ?? null,
      metadata: body.metadata ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
      duration: `${durationMs}ms`,
      duration_ms: durationMs,
      flow_id: flowId,
      item_id: itemId,
    });

    if (isSlowDuration(durationMs)) {
      logger.warn("Client log API slow response", {
        duration_ms: durationMs,
        endpoint: "/api/client-log",
        flow_id: flowId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const durationMs = getDurationMs(startTime);
    logger.error("Client log API failed", error as Error, {
      duration: `${durationMs}ms`,
      duration_ms: durationMs,
      status: 500,
      error_code: "client_log_api_failed",
      endpoint: "/api/client-log",
      client_ip_hash: getClientIpHash(req),
    });
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}
