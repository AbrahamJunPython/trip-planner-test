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

    // TODO: Send to external service (Datadog, Sentry, etc.)
    // await this.sendToExternalService(entry);
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
