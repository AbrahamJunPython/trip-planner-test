import { createLogger } from "./logger";

const logger = createLogger("rate-limiter");

type RateLimiterOptions = {
  maxTokens?: number;
  refillRate?: number; // tokens per second
  refillInterval?: number; // milliseconds
};

const DEFAULT_OPTIONS: Required<RateLimiterOptions> = {
  maxTokens: 10,
  refillRate: 1,
  refillInterval: 1000,
};

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private options: Required<RateLimiterOptions>;

  constructor(
    private name: string,
    options: RateLimiterOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.tokens = this.options.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const intervalsElapsed = Math.floor(timePassed / this.options.refillInterval);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.options.refillRate;
      this.tokens = Math.min(this.tokens + tokensToAdd, this.options.maxTokens);
      this.lastRefill = now;
      
      logger.debug("Rate limiter refilled", {
        name: this.name,
        tokens: this.tokens,
        added: tokensToAdd,
      });
    }
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      logger.debug("Rate limiter acquired", {
        name: this.name,
        acquired: tokens,
        remaining: this.tokens,
      });
      return;
    }

    // Calculate wait time
    const tokensNeeded = tokens - this.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.options.refillRate);
    const waitTime = intervalsNeeded * this.options.refillInterval;

    logger.warn("Rate limit exceeded, waiting", {
      name: this.name,
      waitTime: `${waitTime}ms`,
    });

    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Try again after waiting
    this.refill();
    this.tokens -= tokens;
  }

  tryAcquire(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  reset() {
    this.tokens = this.options.maxTokens;
    this.lastRefill = Date.now();
    logger.info("Rate limiter reset", { name: this.name });
  }
}

// Global rate limiters
const limiters = new Map<string, RateLimiter>();

export function getRateLimiter(
  name: string,
  options?: RateLimiterOptions
): RateLimiter {
  if (!limiters.has(name)) {
    limiters.set(name, new RateLimiter(name, options));
  }
  return limiters.get(name)!;
}

// Wrapper for rate-limited fetch
export async function fetchWithRateLimit<T>(
  limiterName: string,
  fetcher: () => Promise<T>,
  tokens: number = 1
): Promise<T> {
  const limiter = getRateLimiter(limiterName);
  await limiter.acquire(tokens);
  return fetcher();
}
