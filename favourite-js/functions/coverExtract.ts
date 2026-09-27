// Backend cover extraction logic — runs in Node.js (Vite dev-server or standalone).
// No browser APIs, no CORS restrictions; uses browser-like headers.
//
// Provides two fetch layers:
//   fetchBody()      — raw fetch with browser headers (no protection)
//   fetchProtected() — wraps fetchBody with cache + rate limit + dedup

import {
  coverCache, BILIBILI_CACHE_TTL,
  rateLimiter, getRateLimitConfig, dedupRequest,
  extractDomain, isBilibiliDomain,
  RateLimitError, UpstreamBlockedError,
} from './rateLimit'

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Sec-Ch-Ua': '"Chromium";v="126", "Not.A/Brand";v="8", "Google Chrome";v="126"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
}

// ── Bilibili cookie helpers ──────────────────────────────────────────────────
// Bilibili requires a buvid3 cookie to accept API requests from non-browser
// environments (including Cloudflare edge IPs).  Without it the API returns
// -412 (risk control) or simply empty data.

function generateBuvid3(): string {
  // buvid3 is a UUID v4 with a suffix: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx-infoc
  const hex = '0123456789abcdef'
  const uuid = Array.from({ length: 36 }, (_, i) => {
    if (i === 8 || i === 13 || i === 18 || i === 23) return '-'
    if (i === 14) return '4'
    if (i === 19) return hex[(Math.random() * 4) | 8]
    return hex[(Math.random() * 16) | 0]
  }).join('')
  return uuid + 'infoc'
}

// Stable per-isolate buvid3 value (generated once, reused)
let _cachedBuvid3: string | null = null
function getBuvid3(): string {
  if (!_cachedBuvid3) _cachedBuvid3 = generateBuvid3()
  return _cachedBuvid3
}

/** Returns Cookie header string suitable for Bilibili requests */
export function biliCookie(): string {
  return `buvid3=${getBuvid3()}; b_nut=100; b_lsid=10a4c0c8_18e5f8a7b40`
}

export const MAX_BODY = 3 * 1024 * 1024
export const TIMEOUT_MS = 8000

export function toHttps(u: string): string {
  return u.replace(/^http:/i, 'https:')
}

export function resolveUrl(href: string, base: string): string {
  try { return new URL(href, base).href } catch { return href }
}

// ── Raw fetch (no caching / rate limiting) ───────────────────────────────────

export async function fetchBody(
  url: string,
  opts?: { referer?: string; cookie?: string }
): Promise<{ status: number; contentType: string; text: string }> {
  const headers = { ...BROWSER_HEADERS }
  const hostname = new URL(url).hostname
  if (opts?.referer) headers.Referer = opts.referer
  else if (hostname.endsWith('bilibili.com')) headers.Referer = 'https://www.bilibili.com/'
  // Attach buvid3 cookie for Bilibili domains
  if (hostname.endsWith('bilibili.com') || hostname.endsWith('hdslb.com')) {
    headers.Cookie = opts?.cookie || biliCookie()
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const upstream = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' })
    const length = Number(upstream.headers.get('content-length') || 0)
    if (length > MAX_BODY) throw new Error('body too large')
    const text = await upstream.text()
    if (text.length > MAX_BODY) throw new Error('body too large')
    return { status: upstream.status, contentType: upstream.headers.get('content-type') || '', text }
  } finally {
    clearTimeout(timer)
  }
}

// ── Protected fetch (cache + rate limit + dedup) ─────────────────────────────

export interface FetchResult {
  status: number
  contentType: string
  text: string
}

/**
 * Fetch with three layers of protection:
 * 1. Cache — returns cached result if available (Bilibili: 10 min, others: 30 min)
 * 2. Rate limit — blocks if too many requests to the same domain
 * 3. Dedup — concurrent requests for the same URL share one upstream fetch
 *
 * @param cacheKey  Cache key (usually the URL itself)
 * @param url       Actual URL to fetch
 * @param opts      fetchBody options
 * @param cacheTTL  Override TTL in ms (default: 30 min)
 */
export async function fetchProtected(
  cacheKey: string,
  url: string,
  opts?: { referer?: string; cacheTTL?: number },
): Promise<FetchResult> {
  // 1. Check cache
  const cached = coverCache.get(cacheKey)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as FetchResult
      return parsed
    } catch {
      // Cache corruption — fall through to re-fetch
      coverCache.delete(cacheKey)
    }
  }

  // 2. Rate limit check
  const domain = extractDomain(url)
  const config = getRateLimitConfig(domain)
  rateLimiter.check(domain, config.windowMs, config.maxRequests)

  // 3. Dedup concurrent requests
  return dedupRequest('fetch:' + cacheKey, async () => {
    const result = await fetchBody(url, opts)

    // Check Bilibili-specific error codes
    if (isBilibiliDomain(domain) && result.status === 200 && result.text) {
      try {
        const j = JSON.parse(result.text)
        if (j?.code === -412) {
          // Risk control triggered — back off 5 minutes
          rateLimiter.markBackoff(domain, 5 * 60 * 1000)
          throw new UpstreamBlockedError(domain, -412,
            '抱歉，目前服务器繁忙，请几分钟后再试')
        }
        if (j?.code === -799) {
          // Request too frequent — back off 2 minutes
          rateLimiter.markBackoff(domain, 2 * 60 * 1000)
          throw new UpstreamBlockedError(domain, -799,
            '抱歉，目前服务器繁忙，请几分钟后再试')
        }
      } catch (e) {
        if (e instanceof UpstreamBlockedError) throw e
        // Not JSON — continue normally
      }
    }

    // 4. Cache successful results
    if (result.status >= 200 && result.status < 400) {
      const ttl = opts?.cacheTTL ?? (isBilibiliDomain(domain) ? BILIBILI_CACHE_TTL : undefined)
      coverCache.set(cacheKey, JSON.stringify(result), ttl)
    }

    return result
  })
}

// ── meta-tag parsing ─────────────────────────────────────────────────────────

export function extractMetaImage(html: string, pageUrl: string): string | undefined {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1] && !match[1].startsWith('data:')) {
      const resolved = resolveUrl(match[1], pageUrl)
      if (/^https?:/i.test(resolved)) return resolved
    }
  }
  return undefined
}

export function extractBiliPageCover(html: string): string | undefined {
  const metaPatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ]
  for (const p of metaPatterns) {
    const m = html.match(p)
    if (m?.[1] && !m[1].startsWith('data:')) return m[1]
  }
  const pic = html.match(/"pic":"([^"]+)"/)
  if (pic?.[1]) return pic[1]
  return undefined
}

export function getBvid(input: string): string {
  const m = input.match(/BV[0-9A-Za-z]{10}/)
  return m ? m[0] : ''
}
