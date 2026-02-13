import { createLogger } from "./logger";

const logger = createLogger("cache");

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CacheOptions = {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number;
};

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 100;

class Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || DEFAULT_TTL,
      maxSize: options.maxSize || DEFAULT_MAX_SIZE,
    };
  }

  private generateKey(input: any): string {
    return JSON.stringify(input);
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  private evictOldest() {
    if (this.accessOrder.length === 0) return;
    
    const oldestKey = this.accessOrder.shift()!;
    this.cache.delete(oldestKey);
    logger.debug("Evicted oldest cache entry", { key: oldestKey });
  }

  get(key: any): T | null {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      logger.debug("Cache miss", { key: cacheKey });
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      this.accessOrder = this.accessOrder.filter(k => k !== cacheKey);
      logger.debug("Cache expired", { key: cacheKey });
      return null;
    }

    // Update access order (LRU)
    this.accessOrder = this.accessOrder.filter(k => k !== cacheKey);
    this.accessOrder.push(cacheKey);

    logger.debug("Cache hit", { key: cacheKey });
    return entry.value;
  }

  set(key: any, value: T, ttl?: number): void {
    const cacheKey = this.generateKey(key);
    const expiresAt = Date.now() + (ttl || this.options.ttl);

    // Evict if at max size
    if (this.cache.size >= this.options.maxSize && !this.cache.has(cacheKey)) {
      this.evictOldest();
    }

    this.cache.set(cacheKey, { value, expiresAt });
    
    // Update access order
    this.accessOrder = this.accessOrder.filter(k => k !== cacheKey);
    this.accessOrder.push(cacheKey);

    logger.debug("Cache set", { key: cacheKey, ttl: ttl || this.options.ttl });
  }

  delete(key: any): void {
    const cacheKey = this.generateKey(key);
    this.cache.delete(cacheKey);
    this.accessOrder = this.accessOrder.filter(k => k !== cacheKey);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    logger.info("Cache cleared");
  }

  size(): number {
    return this.cache.size;
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info("Cache cleanup completed", { cleaned });
    }
  }
}

// Global caches
const caches = new Map<string, Cache<any>>();

export function getCache<T>(name: string, options?: CacheOptions): Cache<T> {
  if (!caches.has(name)) {
    caches.set(name, new Cache<T>(options));
  }
  return caches.get(name)!;
}

// Cached fetch wrapper
export async function fetchWithCache<T>(
  cacheKey: any,
  fetcher: () => Promise<T>,
  options: { cacheName?: string; ttl?: number } = {}
): Promise<T> {
  const cache = getCache<T>(options.cacheName || "default");
  
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const result = await fetcher();
  cache.set(cacheKey, result, options.ttl);
  return result;
}

// Periodic cleanup (run every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    for (const cache of caches.values()) {
      cache.cleanup();
    }
  }, 5 * 60 * 1000);
}
