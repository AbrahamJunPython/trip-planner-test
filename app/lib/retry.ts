import { createLogger } from "./logger";

const logger = createLogger("retry");

type RetryOptions = {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: Error) => void;
};

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  onRetry: () => {},
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, options.maxDelay);
}

function isRetryableError(error: any, options: Required<RetryOptions>): boolean {
  // Network errors
  if (error.name === "TypeError" && error.message.includes("fetch")) {
    return true;
  }

  // Timeout errors
  if (error.name === "AbortError" || error.message.includes("timeout")) {
    return true;
  }

  // HTTP status codes
  if (error.status && options.retryableStatuses.includes(error.status)) {
    return true;
  }

  return false;
}

// Add timeout to fetch
function fetchWithTimeout(url: string, init?: RequestInit, timeout: number = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      logger.debug(`Fetch attempt ${attempt}/${opts.maxRetries + 1}`, { url });

      const response = await fetchWithTimeout(url, init, 30000);

      // Success
      if (response.ok) {
        if (attempt > 1) {
          logger.info(`Fetch succeeded after ${attempt} attempts`, { url });
        }
        return response;
      }

      // Non-retryable error
      if (!opts.retryableStatuses.includes(response.status)) {
        logger.warn(`Non-retryable status ${response.status}`, { url });
        return response;
      }

      // Retryable error
      const error: any = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    } catch (error) {
      lastError = error as Error;

      // Last attempt
      if (attempt > opts.maxRetries) {
        logger.error(`Fetch failed after ${attempt} attempts`, lastError, { url });
        throw lastError;
      }

      // Check if retryable
      if (!isRetryableError(error, opts)) {
        logger.warn("Non-retryable error", { url, error: (error as Error).message });
        throw error;
      }

      // Retry
      const delayMs = calculateDelay(attempt, opts);
      logger.warn(`Retrying in ${delayMs}ms (attempt ${attempt})`, {
        url,
        error: (error as Error).message,
      });

      opts.onRetry(attempt, error as Error);
      await delay(delayMs);
    }
  }

  throw lastError || new Error("Fetch failed");
}

// OpenAI専用リトライ
export async function fetchOpenAIWithRetry(
  apiKey: string,
  body: any,
  options: RetryOptions = {}
): Promise<any> {
  return fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    {
      maxRetries: 2,
      initialDelay: 2000,
      retryableStatuses: [429, 500, 502, 503, 504],
      ...options,
    }
  ).then((res) => res.json());
}

// フォールバック付きfetch
export async function fetchWithFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  options: { timeout?: number } = {}
): Promise<T> {
  const timeout = options.timeout || 10000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const result = await Promise.race([
      primary(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Primary timeout")), timeout)
      ),
    ]);

    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    logger.warn("Primary fetch failed, using fallback", {
      error: (error as Error).message,
    });
    return fallback();
  }
}
