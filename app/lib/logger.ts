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

function truncateString(value: string, max = 2000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...<truncated>`;
}

function sanitizeLogEntry(entry: LogEntry): LogEntry {
  const cloned: LogEntry = {
    ...entry,
    message: truncateString(entry.message, 1000),
    context: entry.context ? { ...entry.context } : undefined,
  };

  if (entry.data !== undefined) {
    try {
      cloned.data = JSON.parse(
        truncateString(JSON.stringify(entry.data), 6000)
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

class Logger {
  private context: LogContext = {};

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

    try {
      await fetch(lambdaUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-aws-access-key": accessKey,
          "x-aws-secret": secret,
        },
        body: JSON.stringify(entry),
        cache: "no-store",
      });
    } catch (sendError) {
      console.error("[LOGGER] Failed to send log to AWS Lambda:", sendError);
    }
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
