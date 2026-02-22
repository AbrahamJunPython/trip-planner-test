import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/go/[offer_id]");

function normalizeRedirectTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ offer_id: string }> }
) {
  const { offer_id: offerId } = await context.params;
  const targetRaw = req.nextUrl.searchParams.get("target");
  const target = normalizeRedirectTarget(targetRaw);

  const sessionId = req.nextUrl.searchParams.get("session_id");
  const userId = req.nextUrl.searchParams.get("user_id");
  const deviceId = req.nextUrl.searchParams.get("device_id");
  const flowId = req.nextUrl.searchParams.get("flow_id");
  const itemId = req.nextUrl.searchParams.get("item_id");
  const page = req.nextUrl.searchParams.get("page");
  const missingTrackingFields = [
    typeof sessionId === "string" && sessionId.trim().length > 0 ? null : "session_id",
    typeof itemId === "string" && itemId.trim().length > 0 ? null : "item_id",
  ].filter((v): v is string => v !== null);

  if (!target) {
    logger.warn("Go redirect rejected", {
      event_type: "click",
      offer_id: offerId,
      status: 400,
      error_code: "invalid_redirect_target",
      reason: "target_missing_or_invalid",
      session_id: sessionId,
      user_id: userId,
      device_id: deviceId,
      flow_id: flowId,
      item_id: itemId,
      page,
    });
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  if (missingTrackingFields.length > 0) {
    logger.warn("Go redirect rejected", {
      event_type: "click",
      offer_id: offerId,
      status: 400,
      error_code: "missing_tracking_fields",
      reason: "required_tracking_fields_missing",
      missing_fields: missingTrackingFields,
      session_id: sessionId,
      user_id: userId,
      device_id: deviceId,
      flow_id: flowId,
      item_id: itemId,
      page,
    });
    return NextResponse.json(
      {
        error: "Missing tracking fields",
        required_fields: ["session_id", "item_id"],
        missing_fields: missingTrackingFields,
      },
      { status: 400 }
    );
  }

  logger.info("Go redirect click recorded", {
    event_type: "click",
    offer_id: offerId,
    target_url: target,
    session_id: sessionId,
    user_id: userId,
    device_id: deviceId,
    flow_id: flowId,
    item_id: itemId,
    page,
  });

  return NextResponse.redirect(target, { status: 302 });
}
