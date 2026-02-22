type LogLevel = "info" | "warn" | "error" | "debug";

type LogContext = {
  endpoint?: string;
  requestId?: string;
  userId?: string;
  [key: string]: any;
};

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  data?: any;
  error?: {
    message: string;
    stack?: string;
  };
};

const AWS_FORWARDABLE_CLIENT_EVENTS = new Set([
  "page_view",
  "start_button_click",
  "ai_consult_click",
  "item_stage",
  "ai_consult_snapshot",
  "reservation_click",
]);

type AwsLogClassification = {
  log_class:
    | "user_event"
    | "api_failure"
    | "api_latency_slow"
    | "external_dependency_failure"
    | "retry_exhausted"
    | "rate_limited"
    | "schema_mismatch"
    | "security_reject"
    | "operational";
  event_name: string;
  severity: LogLevel;
  endpoint: string | null;
  duration_ms: number | null;
};

function truncateString(value: string, max = 2000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...<truncated>`;
}

function sanitizeLogEntry(entry: LogEntry): LogEntry {
  const isFullOgpResponseLog =
    entry.context?.endpoint === "/api/ogp" &&
    entry.message === "OGP response generated";
  const isAiConsultSnapshotLog =
    entry.context?.endpoint === "/api/client-log" &&
    entry.message === "Client event received" &&
    typeof entry.data === "object" &&
    entry.data !== null &&
    (entry.data as Record<string, unknown>).event_type === "ai_consult_snapshot";

  const cloned: LogEntry = {
    ...entry,
    message: truncateString(entry.message, 1000),
    context: entry.context ? { ...entry.context } : undefined,
  };

  if (entry.data !== undefined) {
    try {
      const serialized = JSON.stringify(entry.data);
      cloned.data = JSON.parse(
        isFullOgpResponseLog || isAiConsultSnapshotLog
          ? serialized
          : truncateString(serialized, 6000)
      );
    } catch {
      cloned.data = { note: "unserializable_data" };
    }
  }

  if (entry.error) {
    cloned.error = {
      message: truncateString(entry.error.message, 1000),
      stack: entry.error.stack ? truncateString(entry.error.stack, 4000) : undefined,
    };
  }

  return cloned;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function parseDurationMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const m = value.match(/^(\d+(?:\.\d+)?)ms$/);
    if (!m) return null;
    const parsed = Number(m[1]);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function hasText(value: unknown, pattern: RegExp): boolean {
  return typeof value === "string" && pattern.test(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Logger {
  private context: LogContext = {};
  private static consecutiveLambdaFailures = 0;
  private static lambdaDisabledUntil = 0;
  private static recentLogSignatures = new Map<string, number>();

  setContext(context: LogContext) {
    this.context = { ...this.context, ...context };
  }

  private log(level: LogLevel, message: string, data?: any, error?: Error) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
    };

    if (data) entry.data = data;
    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    // Console output with color
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const contextStr = Object.keys(this.context).length 
      ? ` ${JSON.stringify(this.context)}` 
      : "";

    console.log(`${prefix}${contextStr} ${message}`);
    
    if (data) {
      console.log("Data:", JSON.stringify(data, null, 2));
    }
    
    if (error) {
      console.error("Error:", error.message);
      if (error.stack) console.error(error.stack);
    }

    void this.sendToAwsLambda(sanitizeLogEntry(entry));
  }

  private async sendToAwsLambda(entry: LogEntry) {
    const lambdaUrl = process.env.AWS_LOG_LAMBDA_URL;
    const accessKey = process.env.AWS_S3_ACCESS_KEY;
    const secret = process.env.AWS_S3_SECRET;

    if (!lambdaUrl || !accessKey || !secret) {
      return;
    }
    if (!this.shouldForwardToAws(entry)) {
      return;
    }

    if (Date.now() < Logger.lambdaDisabledUntil) {
      return;
    }

    const timeoutMs = parsePositiveInt(process.env.AWS_LOG_LAMBDA_TIMEOUT_MS, 15000);
    const maxAttempts = parsePositiveInt(process.env.AWS_LOG_LAMBDA_RETRIES, 2);
    const dedupeWindowMs = parsePositiveInt(
      process.env.AWS_LOG_LAMBDA_INFO_DEDUPE_WINDOW_MS,
      5000
    );
    if (this.shouldSuppressDuplicate(entry, dedupeWindowMs)) {
      return;
    }

    const logRequestId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const classification = this.classifyForAws(entry);
    const payload = {
      ...entry,
      aws_meta: classification,
      context: {
        ...(entry.context ?? {}),
        logRequestId,
      },
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(lambdaUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-aws-access-key": accessKey,
            "x-aws-secret": secret,
            "x-log-request-id": logRequestId,
          },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          Logger.consecutiveLambdaFailures = 0;
          Logger.lambdaDisabledUntil = 0;
          return;
        }

        const bodyPreview = await response.text().catch(() => "");
        console.error("[LOGGER] AWS Lambda log forwarding failed:", {
          logRequestId,
          attempt,
          maxAttempts,
          status: response.status,
          statusText: response.statusText,
          bodyPreview: bodyPreview.slice(0, 300),
          endpoint: entry.context?.endpoint ?? null,
          level: entry.level,
        });

        if (attempt < maxAttempts && response.status >= 500) {
          await sleep(250 * attempt);
          continue;
        }
        break;
      } catch (sendError) {
        console.error("[LOGGER] Failed to send log to AWS Lambda:", {
          logRequestId,
          attempt,
          maxAttempts,
          error: sendError,
          endpoint: entry.context?.endpoint ?? null,
          level: entry.level,
        });

        if (attempt < maxAttempts) {
          await sleep(250 * attempt);
          continue;
        }
      }
    }

    Logger.consecutiveLambdaFailures += 1;
    if (Logger.consecutiveLambdaFailures >= 5) {
      const cooldownMs = parsePositiveInt(process.env.AWS_LOG_LAMBDA_COOLDOWN_MS, 60000);
      Logger.lambdaDisabledUntil = Date.now() + cooldownMs;
      Logger.consecutiveLambdaFailures = 0;
      console.error("[LOGGER] AWS Lambda forwarding temporarily disabled after repeated failures", {
        cooldownMs,
      });
    }
  }

  private shouldForwardToAws(entry: LogEntry): boolean {
    // Always forward high-priority operational logs.
    if (entry.level === "error" || entry.level === "warn") {
      return true;
    }

    // Suppress debug in AWS forwarding by default.
    if (entry.level === "debug") {
      return false;
    }

    // For info logs, only forward selected client analytics events.
    if (
      entry.level === "info" &&
      entry.context?.endpoint === "/api/client-log" &&
      entry.message === "Client event received"
    ) {
      const eventType =
        typeof entry.data === "object" && entry.data !== null
          ? (entry.data as Record<string, unknown>).event_type
          : null;
      return typeof eventType === "string" && AWS_FORWARDABLE_CLIENT_EVENTS.has(eventType);
    }

    return false;
  }

  private classifyForAws(entry: LogEntry): AwsLogClassification {
    const endpoint = typeof entry.context?.endpoint === "string" ? entry.context.endpoint : null;
    const message = entry.message ?? "";
    const data =
      typeof entry.data === "object" && entry.data !== null
        ? (entry.data as Record<string, unknown>)
        : null;
    const durationMs = parseDurationMs(data?.duration);
    const slowThresholdMs = parsePositiveInt(process.env.AWS_LOG_SLOW_THRESHOLD_MS, 3000);

    if (
      endpoint === "/api/client-log" &&
      message === "Client event received" &&
      typeof data?.event_type === "string"
    ) {
      return {
        log_class: "user_event",
        event_name: data.event_type,
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    if (
      entry.level === "warn" &&
      (hasText(message, /invalid .*request/i) || hasText(message, /schema/i))
    ) {
      return {
        log_class: "schema_mismatch",
        event_name: "schema_mismatch",
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    if (
      entry.level === "warn" &&
      (hasText(message, /rejected/i) || hasText(message, /private network access not allowed/i))
    ) {
      return {
        log_class: "security_reject",
        event_name: "security_reject",
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    if (
      hasText(message, /rate limit/i) ||
      hasText(String(data?.reason ?? ""), /rate limit/i)
    ) {
      return {
        log_class: "rate_limited",
        event_name: "rate_limited",
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    if (
      entry.level === "error" &&
      (hasText(message, /retry/i) || hasText(String(data?.error ?? ""), /retry/i))
    ) {
      return {
        log_class: "retry_exhausted",
        event_name: "retry_exhausted",
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    if (
      entry.level === "error" &&
      (hasText(message, /openai|nominatim|oembed|lambda|fetch/i) ||
        hasText(String(data?.error ?? ""), /timeout|econn|network|gateway|service unavailable/i))
    ) {
      return {
        log_class: "external_dependency_failure",
        event_name: "external_dependency_failure",
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    if (entry.level === "error") {
      return {
        log_class: "api_failure",
        event_name: "api_failure",
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    if (
      entry.level === "warn" &&
      durationMs !== null &&
      durationMs >= slowThresholdMs
    ) {
      return {
        log_class: "api_latency_slow",
        event_name: "api_latency_slow",
        severity: entry.level,
        endpoint,
        duration_ms: durationMs,
      };
    }

    return {
      log_class: "operational",
      event_name: "operational",
      severity: entry.level,
      endpoint,
      duration_ms: durationMs,
    };
  }

  private shouldSuppressDuplicate(entry: LogEntry, dedupeWindowMs: number): boolean {
    if (entry.level !== "info" || dedupeWindowMs <= 0) {
      return false;
    }

    const endpoint = entry.context?.endpoint ?? "";
    let dataString = "";
    if (entry.data !== undefined) {
      try {
        dataString = truncateString(JSON.stringify(entry.data), 800);
      } catch {
        dataString = "unserializable_data";
      }
    }
    const signature = `${endpoint}|${entry.level}|${entry.message}|${dataString}`;

    const now = Date.now();
    const expiresAt = Logger.recentLogSignatures.get(signature);
    if (expiresAt && now < expiresAt) {
      return true;
    }

    Logger.recentLogSignatures.set(signature, now + dedupeWindowMs);

    // Light cleanup to avoid unbounded growth
    if (Logger.recentLogSignatures.size > 2000) {
      for (const [key, expiry] of Logger.recentLogSignatures.entries()) {
        if (expiry <= now) {
          Logger.recentLogSignatures.delete(key);
        }
      }
    }

    return false;
  }

  info(message: string, data?: any) {
    this.log("info", message, data);
  }

  warn(message: string, data?: any) {
    this.log("warn", message, data);
  }

  error(message: string, error?: Error, data?: any) {
    this.log("error", message, data, error);
  }

  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === "development") {
      this.log("debug", message, data);
    }
  }
}

export function createLogger(endpoint: string): Logger {
  const logger = new Logger();
  logger.setContext({ endpoint });
  return logger;
}

// OpenAI呼び出し専用ロガー
export function logOpenAICall(params: {
  endpoint: string;
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
}) {
  const logger = createLogger(params.endpoint);
  logger.info("OpenAI API Call", {
    model: params.model,
    promptLength: params.prompt.length,
    promptPreview: params.prompt.substring(0, 200),
    maxTokens: params.maxTokens,
    temperature: params.temperature,
  });
}

export function logOpenAIResponse(params: {
  endpoint: string;
  success: boolean;
  response?: any;
  error?: Error;
  duration: number;
}) {
  const logger = createLogger(params.endpoint);
  
  if (params.success && params.response) {
    logger.info("OpenAI API Success", {
      duration: `${params.duration}ms`,
      responseLength: JSON.stringify(params.response).length,
      responsePreview: JSON.stringify(params.response).substring(0, 200),
    });
  } else if (params.error) {
    logger.error("OpenAI API Failed", params.error, {
      duration: `${params.duration}ms`,
    });
  }
}
