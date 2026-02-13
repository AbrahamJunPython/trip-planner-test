import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "./logger";

type ApiHandler = (req: NextRequest) => Promise<NextResponse>;

export function withErrorTracking(
  endpoint: string,
  handler: ApiHandler
): ApiHandler {
  return async (req: NextRequest) => {
    const logger = createLogger(endpoint);
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    logger.setContext({ requestId });

    try {
      logger.info("Request started", {
        method: req.method,
        url: req.url,
      });

      const response = await handler(req);
      const duration = Date.now() - startTime;

      logger.info("Request completed", {
        status: response.status,
        duration: `${duration}ms`,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error("Request failed", error as Error, {
        duration: `${duration}ms`,
      });

      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Internal server error",
          requestId,
        },
        { status: 500 }
      );
    }
  };
}

// OpenAI専用トラッキング
export function trackOpenAICall<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const logger = createLogger("openai");
  const startTime = Date.now();

  logger.info(`${operation} started`);

  return fn()
    .then((result) => {
      const duration = Date.now() - startTime;
      logger.info(`${operation} completed`, {
        duration: `${duration}ms`,
        resultSize: JSON.stringify(result).length,
      });
      return result;
    })
    .catch((error) => {
      const duration = Date.now() - startTime;
      logger.error(`${operation} failed`, error, {
        duration: `${duration}ms`,
      });
      throw error;
    });
}
