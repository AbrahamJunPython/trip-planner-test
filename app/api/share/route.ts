import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/api/share");

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

const memStore = new Map<string, any>();

function generateId(): string {
  return Math.random().toString(36).substring(2, 8);
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const data = await req.json();
    const id = generateId();
    logger.info("Share POST request received", {
      storage: redis ? "redis" : "memory",
      payloadSize: JSON.stringify(data).length,
      generatedId: id,
    });
    
    if (redis) {
      await redis.set(id, JSON.stringify(data), { ex: 86400 });
    } else {
      memStore.set(id, { data, expires: Date.now() + 86400000 });
    }

    logger.info("Share POST response generated", {
      duration: `${Date.now() - startTime}ms`,
      id,
    });
    
    return NextResponse.json({ id });
  } catch (error) {
    logger.error("Share POST failed", error as Error, {
      duration: `${Date.now() - startTime}ms`,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    const id = req.nextUrl.searchParams.get("id");
    logger.info("Share GET request received", { id });
    if (!id) {
      logger.warn("Share GET invalid request", {
        duration: `${Date.now() - startTime}ms`,
        reason: "ID required",
      });
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let data;
    if (redis) {
      const result = await redis.get(id);
      if (!result) {
        logger.warn("Share GET not found (redis)", {
          duration: `${Date.now() - startTime}ms`,
          id,
        });
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      data = typeof result === "string" ? JSON.parse(result) : result;
    } else {
      const item = memStore.get(id);
      if (!item || Date.now() > item.expires) {
        memStore.delete(id);
        logger.warn("Share GET not found/expired (memory)", {
          duration: `${Date.now() - startTime}ms`,
          id,
        });
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      data = item.data;
    }

    logger.info("Share GET response generated", {
      duration: `${Date.now() - startTime}ms`,
      id,
      payloadSize: JSON.stringify(data).length,
    });

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("Share GET failed", error as Error, {
      duration: `${Date.now() - startTime}ms`,
    });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
