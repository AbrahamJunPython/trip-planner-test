import { NextResponse } from "next/server";
import { getAllHealthStatuses } from "@/app/lib/health-check";
import { getCircuitBreakerState } from "@/app/lib/circuit-breaker";
import { getCache } from "@/app/lib/cache";
import { createLogger } from "@/app/lib/logger";

const logger = createLogger("/api/health");

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  logger.info("Health check request received");
  const healthStatuses = getAllHealthStatuses();
  
  // Circuit breaker states
  const circuitBreakers = {
    "openai-chat": getCircuitBreakerState("openai-chat"),
    "openai-generate": getCircuitBreakerState("openai-generate"),
  };

  // Cache stats
  const cacheStats = {
    default: getCache("default").size(),
    ogp: getCache("ogp").size(),
    classify: getCache("classify").size(),
  };

  // Overall status
  const hasUnhealthy = Object.values(healthStatuses).some(
    (status) => status?.status === "unhealthy"
  );
  const hasDegraded = Object.values(healthStatuses).some(
    (status) => status?.status === "degraded"
  );
  const hasOpenCircuit = Object.values(circuitBreakers).some(
    (state) => state === "OPEN"
  );

  const overallStatus = hasUnhealthy || hasOpenCircuit
    ? "unhealthy"
    : hasDegraded
    ? "degraded"
    : "healthy";

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks: healthStatuses,
    circuitBreakers,
    cache: cacheStats,
    environment: {
      nodeEnv: process.env.NODE_ENV,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    },
  };

  logger.info("Health check response generated", {
    duration: `${Date.now() - startTime}ms`,
    status: overallStatus,
    circuitBreakers,
    cacheStats,
  });

  return NextResponse.json(response);
}
