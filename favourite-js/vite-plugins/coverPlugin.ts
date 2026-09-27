// Vite dev-server plugin — registers /api/* middleware endpoints for dev mode.
// In production, Cloudflare Pages Functions handle these routes.
// Imports cover extraction logic from ../functions/coverExtract.ts

import type { Plugin } from 'vite'
import {
  BROWSER_HEADERS, MAX_BODY, TIMEOUT_MS,
  toHttps, fetchProtected,
  extractMetaImage, extractBiliPageCover, getBvid,
} from '../functions/coverExtract'
import {
  imageCache,
  RateLimitError, UpstreamBlockedError,
} from '../functions/rateLimit'

// ── Friendly error messages for known error types ────────────────────────────

function friendlyError(err: unknown): { status: number; message: string } {
  if (err instanceof RateLimitError) {
    return { status: 429, message: `请求过于频繁，请 ${err.retryAfterSec} 秒后重试` }
  }
  if (err instanceof UpstreamBlockedError) {
    return { status: 503, message: err.message }
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('connect')) {
    return { status: 502, message: '无法连接到目标服务器' }
  }
  if (msg.includes('abort') || msg.includes('timeout') || msg.includes('timed out')) {
    return { status: 504, message: '请求超时，请稍后重试' }
  }
  if (msg.includes('body too large') || msg.includes('response too large')) {
    return { status: 413, message: '响应内容过大' }
  }
  // "no cover found" is not a server error — it's a 404
  if (msg.includes('no cover found') || msg.includes('no bvid')) {
    return { status: 404, message: '无法提取封面，请手动设置' }
  }
  return { status: 500, message: msg || '封面提取失败' }
}

// ── Bilibili cover extraction (API → page og:image → player API) ────────────

async function extractBilibiliCover(videoUrl: string): Promise<string> {
  const bvid = getBvid(videoUrl)
  if (!bvid) throw new Error('no bvid in url')

  // 1) Official API
  try {
    const api = await fetchProtected(
      'bili-api:' + bvid,
      'https://api.bilibili.com/x/web-interface/view?bvid=' + bvid,
      { referer: 'https://www.bilibili.com/' },
    )
    if (api.status === 200 && api.text) {
      let j: any = null
      try { j = JSON.parse(api.text) } catch { j = null }
      if (j?.code === 0 && typeof j.data?.pic === 'string' && j.data.pic) return toHttps(j.data.pic)
      if (j?.code === 0 && typeof j.data?.pages?.[0]?.first_frame === 'string' && j.data.pages[0].first_frame) return toHttps(j.data.pages[0].first_frame)
    }
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof UpstreamBlockedError) throw e
  }

  // 2) Video page HTML
  try {
    const page = await fetchProtected(
      'bili-page:' + bvid,
      videoUrl,
      { referer: 'https://www.bilibili.com/' },
    )
    if (page.status === 200 && page.text) {
      const cover = extractBiliPageCover(page.text)
      if (cover) return toHttps(cover)
    }
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof UpstreamBlockedError) throw e
  }

  // 3) Player API
  try {
    const api2 = await fetchProtected(
      'bili-player:' + bvid,
      'https://api.bilibili.com/x/player/pic?bvid=' + bvid,
      { referer: 'https://www.bilibili.com/video/' + bvid },
    )
    if (api2.status === 200 && api2.text) {
      let j: any = null
      try { j = JSON.parse(api2.text) } catch { j = null }
      if (j?.code === 0 && typeof j.data === 'string' && j.data) return toHttps(j.data)
    }
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof UpstreamBlockedError) throw e
  }

  throw new Error('no cover found for bilibili link')
}

// ── Generic cover extraction ─────────────────────────────────────────────────

async function extractGenericCover(url: string): Promise<string> {
  const { status, text } = await fetchProtected('generic:' + url, url)
  if (status >= 400) throw new Error('HTTP ' + status)
  const image = extractMetaImage(text, url)
  if (image) return toHttps(image)
  throw new Error('no cover found')
}

// ── Vite plugin ──────────────────────────────────────────────────────────────

export default function coverProxyPlugin(): Plugin {
  return {
    name: 'cover-proxy',
    configureServer(server) {
      // /api/extract-cover?url=...  →  JSON { cover } or { error }
      server.middlewares.use('/api/extract-cover', async (req, res) => {
        const reqUrl = new URL(req.url || '/', 'http://localhost')
        const raw = reqUrl.searchParams.get('url')
        if (!raw) { res.statusCode = 400; res.end('missing url'); return }
        try {
          let target: URL
          try { target = new URL(raw) } catch { res.statusCode = 400; res.end('invalid url'); return }
          if (target.protocol !== 'http:' && target.protocol !== 'https:') { res.statusCode = 400; res.end('unsupported protocol'); return }
          const isBili = target.hostname.endsWith('bilibili.com')
          const cover = isBili ? await extractBilibiliCover(raw) : await extractGenericCover(raw)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ cover }))
        } catch (err) {
          const { status, message } = friendlyError(err)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.statusCode = status
          res.end(JSON.stringify({ error: message }))
        }
      })

      // /api/cover-img?url=...  →  proxied image binary (with cache)
      server.middlewares.use('/api/cover-img', async (req, res) => {
        const reqUrl = new URL(req.url || '/', 'http://localhost')
        const raw = reqUrl.searchParams.get('url')
        if (!raw) { res.statusCode = 400; res.end('missing url'); return }
        let target: URL
        try { target = new URL(raw) } catch { res.statusCode = 400; res.end('invalid url'); return }
        if (target.protocol !== 'http:' && target.protocol !== 'https:') { res.statusCode = 400; res.end('unsupported protocol'); return }

        // Check image cache first
        const cached = imageCache.get(raw)
        if (cached) {
          res.setHeader('Content-Type', 'image/jpeg')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(cached)
          return
        }

        const headers: Record<string, string> = { ...BROWSER_HEADERS }
        if (target.hostname.endsWith('hdslb.com') || target.hostname.endsWith('bilibili.com')) { headers.Referer = 'https://www.bilibili.com/' }
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
        try {
          const upstream = await fetch(target.href, { headers, signal: controller.signal, redirect: 'follow' })
          if (!upstream.ok) { res.statusCode = upstream.status; res.end('upstream ' + upstream.status); return }
          const buf = new Uint8Array(await upstream.arrayBuffer())
          if (buf.length > MAX_BODY) { res.statusCode = 413; res.end('image too large'); return }
          // Cache the image
          imageCache.set(raw, buf)
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(buf)
        } catch (err) {
          res.statusCode = 502
          res.end(err instanceof Error ? err.message : 'image proxy failed')
        } finally { clearTimeout(timer) }
      })
    },
  }
}
