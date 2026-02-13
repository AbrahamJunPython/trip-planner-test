import { setupOpenAIHealthCheck } from "./health-check";

// Initialize health checks on server startup
let initialized = false;

export function initializeHealthChecks() {
  if (initialized) return;
  
  // Setup OpenAI health check
  setupOpenAIHealthCheck();
  
  initialized = true;
}

// Auto-initialize in Node.js environment
if (typeof window === "undefined" && !initialized) {
  initializeHealthChecks();
}
