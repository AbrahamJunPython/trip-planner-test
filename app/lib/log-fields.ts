import { createHash } from "crypto";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function getDurationMs(startTime: number): number {
  return Date.now() - startTime;
}

export function getSlowThresholdMs(): number {
  return parsePositiveInt(process.env.AWS_LOG_SLOW_THRESHOLD_MS, 3000);
}

export function isSlowDuration(durationMs: number): boolean {
  return durationMs >= getSlowThresholdMs();
}

export function getClientIpHash(req: Request): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp?.trim();
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

