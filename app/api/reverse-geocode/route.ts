import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/api/reverse-geocode");

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  logger.info("Reverse-geocode request received", {
    lat,
    lon,
  });

  if (!lat || !lon) {
    logger.warn("Reverse-geocode request invalid", {
      duration: `${Date.now() - startTime}ms`,
      reason: "lat/lon required",
    });
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
    lat
  )}&lon=${encodeURIComponent(lon)}&accept-language=ja`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "trip-planner-mvp/1.0",
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    const text = await r.text();
    if (!r.ok) {
      logger.warn("Reverse-geocode upstream returned error", {
        duration: `${Date.now() - startTime}ms`,
        status: r.status,
        bodyPreview: text.slice(0, 200),
      });
      return NextResponse.json(
        { error: "nominatim_error", status: r.status, detail: text },
        { status: r.status }
      );
    }

    logger.info("Reverse-geocode response generated", {
      duration: `${Date.now() - startTime}ms`,
      status: r.status,
      bodyPreview: text.slice(0, 200),
    });

    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    logger.error("Reverse-geocode fetch failed", error as Error, {
      duration: `${Date.now() - startTime}ms`,
    });
    return NextResponse.json(
      { error: "fetch_failed", detail: String(error) },
      { status: 500 }
    );
  }
}
