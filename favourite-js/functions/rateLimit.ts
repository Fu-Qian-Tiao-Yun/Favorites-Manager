// ── In-memory cache, rate limiter, and request deduplication ─────────────────
//
// Three layers of protection:
//
// 1. **Cache** — Same URL within TTL returns the cached result instantly.
//    Bilibili: 10 min, generic sites: 30 min, images: 24 h.
//
// 2. **Per-domain rate limiter** — Sliding-window counter per hostname.
//    Bilibili: 30 req/min, other domains: 50 req/min.
//    Exceeding the limit throws a retryable error.
//
// 3. **In-flight dedup** — Two simultaneous requests for the same URL share
//    a single upstream fetch, halving load on duplicate traffic.

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private readonly defaultTTL: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(defaultTTL_ms: number) {
    this.defaultTTL = defaultTTL_ms
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.data
  }

  set(key: string, data: T, ttlOverride?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlOverride ?? this.defaultTTL),
    })
    this.scheduleCleanup()
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  /** Evict expired entries every 5 minutes */
  private scheduleCleanup(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [k, v] of this.store) {
        if (now > v.expiresAt) this.store.delete(k)
      }
      if (this.store.size === 0 && this.cleanupTimer) {
        clearInterval(this.cleanupTimer)
        this.cleanupTimer = null
      }
    }, 5 * 60 * 1000)
    // Allow Node to exit even if the timer is running
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref()
    }
  }

  get size(): number { return this.store.size }
}

// Cover URL cache: 10 min default (Bilibili), 30 min for generic sites
export const coverCache = new TTLCache<string>(30 * 60 * 1000)
export const BILIBILI_CACHE_TTL = 10 * 60 * 1000  // 10 minutes

// Image proxy cache: 24 hours (images rarely change)
export const imageCache = new TTLCache<Uint8Array>(24 * 60 * 60 * 1000)

// ── Per-domain rate limiter (sliding window) ─────────────────────────────────

interface DomainBucket {
  /** Timestamps of requests in the current window (ms) */
  timestamps: number[]
}

class DomainRateLimiter {
  private buckets = new Map<string, DomainBucket>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  /** Check if a request is allowed. Throws if rate-limited. */
  check(domain: string, windowMs: number, maxRequests: number): void {
    const now = Date.now()
    let bucket = this.buckets.get(domain)
    if (!bucket) {
      bucket = { timestamps: [] }
      this.buckets.set(domain, bucket)
    }
    // Prune timestamps outside the window
    bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs)
    if (bucket.timestamps.length >= maxRequests) {
      const oldestInWindow = bucket.timestamps[0]
      const retryAfterMs = windowMs - (now - oldestInWindow)
      const retryAfterSec = Math.ceil(retryAfterMs / 1000)
      throw new RateLimitError(domain, retryAfterSec)
    }
    bucket.timestamps.push(now)
    this.scheduleCleanup(windowMs)
  }

  /** Record that a domain is temporarily backed off */
  markBackoff(domain: string, backoffMs: number): void {
    const now = Date.now()
    let bucket = this.buckets.get(domain)
    if (!bucket) {
      bucket = { timestamps: [] }
      this.buckets.set(domain, bucket)
    }
    // Flood the bucket to block requests for the backoff period
    const floodCount = 100
    bucket.timestamps = []
    for (let i = 0; i < floodCount; i++) {
      bucket.timestamps.push(now - backoffMs + (i * backoffMs / floodCount))
    }
  }

  private scheduleCleanup(windowMs: number): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [domain, bucket] of this.buckets) {
        bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs * 2)
        if (bucket.timestamps.length === 0) this.buckets.delete(domain)
      }
      if (this.buckets.size === 0 && this.cleanupTimer) {
        clearInterval(this.cleanupTimer)
        this.cleanupTimer = null
      }
    }, windowMs)
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref()
    }
  }
}

export const rateLimiter = new DomainRateLimiter()

// Rate limit config per domain type
export const RATE_LIMITS = {
  bilibili: { windowMs: 60_000, maxRequests: 30 },   // 30 req/min
  generic:  { windowMs: 60_000, maxRequests: 50 },   // 50 req/min
  image:    { windowMs: 60_000, maxRequests: 100 },  // 100 req/min for images
} as const

export function getRateLimitConfig(domain: string) {
  if (domain.endsWith('bilibili.com')) return RATE_LIMITS.bilibili
  return RATE_LIMITS.generic
}

// ── In-flight request deduplication ──────────────────────────────────────────

const inflight = new Map<string, Promise<any>>()

/**
 * Deduplicate concurrent requests for the same key.
 * If a request for `key` is already in flight, returns the same promise.
 * Otherwise, runs `fn` and stores the promise until it settles.
 */
export async function dedupRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fn().finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

// ── Custom error types ───────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor(
    public readonly domain: string,
    public readonly retryAfterSec: number,
  ) {
    super(`Rate limit exceeded for ${domain}. Please retry after ${retryAfterSec}s.`)
    this.name = 'RateLimitError'
  }
}

export class UpstreamBlockedError extends Error {
  constructor(
    public readonly domain: string,
    public readonly upstreamCode: number,
    message?: string,
  ) {
    super(message || `Upstream ${domain} blocked the request (code: ${upstreamCode}). Please try again later.`)
    this.name = 'UpstreamBlockedError'
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function extractDomain(url: string): string {
  try { return new URL(url).hostname } catch { return 'unknown' }
}

export function isBilibiliDomain(domain: string): boolean {
  return domain.endsWith('bilibili.com') || domain.endsWith('hdslb.com')
}
