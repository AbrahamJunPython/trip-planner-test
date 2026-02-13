import { createLogger } from "./logger";

const logger = createLogger("health-check");

type HealthStatus = "healthy" | "degraded" | "unhealthy";

type HealthCheckResult = {
  status: HealthStatus;
  latency: number;
  timestamp: number;
  error?: string;
};

type HealthCheckOptions = {
  interval?: number; // milliseconds
  timeout?: number;
  unhealthyThreshold?: number;
  degradedThreshold?: number;
};

const DEFAULT_OPTIONS: Required<HealthCheckOptions> = {
  interval: 60000, // 1 minute
  timeout: 5000,
  unhealthyThreshold: 3,
  degradedThreshold: 1000, // 1 second
};

class HealthChecker {
  private status: HealthStatus = "healthy";
  private consecutiveFailures = 0;
  private lastCheck: HealthCheckResult | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private options: Required<HealthCheckOptions>;

  constructor(
    private name: string,
    private checkFn: () => Promise<void>,
    options: HealthCheckOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

      await Promise.race([
        this.checkFn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), this.options.timeout)
        ),
      ]);

      clearTimeout(timeoutId);

      const latency = Date.now() - startTime;
      this.consecutiveFailures = 0;

      // Determine status based on latency
      const status: HealthStatus =
        latency > this.options.degradedThreshold ? "degraded" : "healthy";

      this.status = status;
      this.lastCheck = {
        status,
        latency,
        timestamp: Date.now(),
      };

      logger.info(`Health check passed: ${this.name}`, {
        status,
        latency: `${latency}ms`,
      });

      return this.lastCheck;
    } catch (error) {
      this.consecutiveFailures++;

      const latency = Date.now() - startTime;
      const status: HealthStatus =
        this.consecutiveFailures >= this.options.unhealthyThreshold
          ? "unhealthy"
          : "degraded";

      this.status = status;
      this.lastCheck = {
        status,
        latency,
        timestamp: Date.now(),
        error: (error as Error).message,
      };

      logger.error(`Health check failed: ${this.name}`, error as Error, {
        consecutiveFailures: this.consecutiveFailures,
        status,
      });

      return this.lastCheck;
    }
  }

  start() {
    if (this.intervalId) {
      logger.warn(`Health checker already started: ${this.name}`);
      return;
    }

    logger.info(`Starting health checker: ${this.name}`, {
      interval: `${this.options.interval}ms`,
    });

    // Initial check
    this.check();

    // Periodic checks
    this.intervalId = setInterval(() => {
      this.check();
    }, this.options.interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info(`Stopped health checker: ${this.name}`);
    }
  }

  getStatus(): HealthStatus {
    return this.status;
  }

  getLastCheck(): HealthCheckResult | null {
    return this.lastCheck;
  }

  isHealthy(): boolean {
    return this.status === "healthy";
  }
}

// Global health checkers
const checkers = new Map<string, HealthChecker>();

export function createHealthChecker(
  name: string,
  checkFn: () => Promise<void>,
  options?: HealthCheckOptions
): HealthChecker {
  if (checkers.has(name)) {
    return checkers.get(name)!;
  }

  const checker = new HealthChecker(name, checkFn, options);
  checkers.set(name, checker);
  return checker;
}

export function getHealthChecker(name: string): HealthChecker | null {
  return checkers.get(name) || null;
}

export function getAllHealthStatuses(): Record<string, HealthCheckResult | null> {
  const statuses: Record<string, HealthCheckResult | null> = {};
  
  for (const [name, checker] of checkers.entries()) {
    statuses[name] = checker.getLastCheck();
  }

  return statuses;
}

// OpenAI health check
export function setupOpenAIHealthCheck() {
  if (!process.env.OPENAI_API_KEY) {
    logger.warn("OpenAI API key not configured, skipping health check");
    return null;
  }

  const checker = createHealthChecker(
    "openai",
    async () => {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API returned ${response.status}`);
      }
    },
    {
      interval: 5 * 60 * 1000, // 5 minutes
      timeout: 5000,
      unhealthyThreshold: 3,
    }
  );

  checker.start();
  return checker;
}
