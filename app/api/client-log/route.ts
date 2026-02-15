import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/api/client-log");

type ClientLogEvent = {
  eventType: "page_view" | "start_button_click";
  page: string;
  targetUrl?: string;
  timestamp?: string;
  referrer?: string;
};

function isValidEventType(value: unknown): value is ClientLogEvent["eventType"] {
  return value === "page_view" || value === "start_button_click";
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = (await req.json().catch(() => null)) as ClientLogEvent | null;
    if (!body || !isValidEventType(body.eventType) || typeof body.page !== "string") {
      logger.warn("Client log request rejected", {
        duration: `${Date.now() - startTime}ms`,
      });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    logger.info("Client event received", {
      eventType: body.eventType,
      page: body.page,
      targetUrl: body.targetUrl ?? null,
      clientTimestamp: body.timestamp ?? null,
      referrer: body.referrer ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
      duration: `${Date.now() - startTime}ms`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Client log API failed", error as Error, {
      duration: `${Date.now() - startTime}ms`,
    });
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}
