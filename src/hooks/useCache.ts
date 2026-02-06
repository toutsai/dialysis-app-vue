// src/hooks/useCache.ts
// Simple in-memory cache with TTL support (replacement for Vue composable useCache)

import { useRef, useCallback } from 'react'

interface CacheEntry<T = unknown> {
  value: T
  timestamp: number
  ttl: number
}

type CacheStore = Map<string, CacheEntry>

const DEFAULT_TTL_MS = 30_000 // 30 seconds

// ---------------------------------------------------------------------------
// Module-level shared cache (singleton across all hook consumers)
// ---------------------------------------------------------------------------

const globalCache: CacheStore = new Map()

/**
 * Retrieves a cached value if it exists and has not expired.
 * Returns `null` if the key is missing or expired.
 */
function cacheGet<T = unknown>(key: string): T | null {
  const entry = globalCache.get(key)
  if (!entry) return null

  const now = Date.now()
  if (now - entry.timestamp > entry.ttl) {
    // Entry expired -- remove it
    globalCache.delete(key)
    return null
  }

  return entry.value as T
}

/**
 * Stores a value in the cache with an optional TTL (defaults to 30 s).
 */
function cacheSet<T = unknown>(key: string, value: T, ttl: number = DEFAULT_TTL_MS): void {
  globalCache.set(key, {
    value,
    timestamp: Date.now(),
    ttl,
  })
}

/**
 * Clears a specific key or the entire cache when called without arguments.
 */
function cacheClear(key?: string): void {
  if (key !== undefined) {
    globalCache.delete(key)
  } else {
    globalCache.clear()
  }
}

/**
 * Checks whether a non-expired cache entry exists for the given key.
 */
function cacheHas(key: string): boolean {
  const entry = globalCache.get(key)
  if (!entry) return false

  const now = Date.now()
  if (now - entry.timestamp > entry.ttl) {
    globalCache.delete(key)
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// React hook wrapper
// ---------------------------------------------------------------------------

export interface UseCacheReturn {
  get: <T = unknown>(key: string) => T | null
  set: <T = unknown>(key: string, value: T, ttl?: number) => void
  clear: (key?: string) => void
  has: (key: string) => boolean
}

/**
 * React hook providing a simple in-memory cache with TTL (default 30 s).
 *
 * The underlying store is a module-level singleton so data is shared across
 * all components that call `useCache()` within the same JS runtime.
 *
 * ```ts
 * const cache = useCache()
 * cache.set('patients', data)           // store with default 30 s TTL
 * cache.set('config', data, 60_000)     // store with 60 s TTL
 * const hit = cache.get<Patient[]>('patients')
 * cache.has('patients')                 // true / false
 * cache.clear('patients')               // clear one key
 * cache.clear()                         // clear everything
 * ```
 */
export function useCache(): UseCacheReturn {
  // Stable references that never change between renders
  const api = useRef<UseCacheReturn>({
    get: cacheGet,
    set: cacheSet,
    clear: cacheClear,
    has: cacheHas,
  })

  return api.current
}

// Also export the standalone functions for non-hook contexts (services, utils)
export { cacheGet, cacheSet, cacheClear, cacheHas }

export default useCache
