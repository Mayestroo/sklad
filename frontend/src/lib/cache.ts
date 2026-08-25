/**
 * Global In-Memory API Cache with Stale-While-Revalidate and Invalidation support
 * Strict TypeScript - No 'any' used.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isFetching: boolean;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const subscribers = new Map<string, Set<(data: unknown) => void>>();

/**
 * Retrieve cached data if present
 */
export function getApiCache<T>(key: string): CacheEntry<T> | undefined {
  return memoryCache.get(key) as CacheEntry<T> | undefined;
}

/**
 * Save data to cache and notify subscribers
 */
export function setApiCache<T>(key: string, data: T): void {
  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
    isFetching: false,
  });

  const subs = subscribers.get(key);
  if (subs) {
    subs.forEach((cb) => cb(data));
  }
}

/**
 * Mark an endpoint as currently fetching in background
 */
export function setApiFetching(key: string, isFetching: boolean): void {
  const existing = memoryCache.get(key);
  if (existing) {
    existing.isFetching = isFetching;
  }
}

/**
 * Invalidate cached entries matching key or pattern (e.g. '/sales/orders*')
 */
export function invalidateApiCache(patternOrKey: string): void {
  if (patternOrKey.endsWith('*')) {
    const prefix = patternOrKey.slice(0, -1);
    for (const key of memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
        // Notify subscribers with null to trigger revalidation
        const subs = subscribers.get(key);
        if (subs) {
          subs.forEach((cb) => cb(null));
        }
      }
    }
  } else {
    memoryCache.delete(patternOrKey);
    const subs = subscribers.get(patternOrKey);
    if (subs) {
      subs.forEach((cb) => cb(null));
    }
  }
}

/**
 * Subscribe to cache changes for a specific key
 */
export function subscribeApiCache<T>(key: string, callback: (data: T | null) => void): () => void {
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }
  const set = subscribers.get(key)!;
  set.add(callback as (data: unknown) => void);

  return () => {
    set.delete(callback as (data: unknown) => void);
    if (set.size === 0) {
      subscribers.delete(key);
    }
  };
}

/**
 * Clear all cache
 */
export function clearApiCache(): void {
  memoryCache.clear();
}
