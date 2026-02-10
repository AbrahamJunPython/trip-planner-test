import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

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
  try {
    const data = await req.json();
    const id = generateId();
    
    if (redis) {
      await redis.set(id, JSON.stringify(data), { ex: 86400 });
    } else {
      memStore.set(id, { data, expires: Date.now() + 86400000 });
    }
    
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    let data;
    if (redis) {
      const result = await redis.get(id);
      if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
      data = typeof result === "string" ? JSON.parse(result) : result;
    } else {
      const item = memStore.get(id);
      if (!item || Date.now() > item.expires) {
        memStore.delete(id);
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      data = item.data;
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
