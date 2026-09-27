// Vite dev-server plugin — registers /api/* middleware endpoints for dev mode.
// In production, Cloudflare Pages Functions handle these routes.
// Imports cover extraction logic from ../functions/coverExtract.ts

import type { Plugin } from 'vite'
import {
  BROWSER_HEADERS, MAX_BODY, TIMEOUT_MS,
  toHttps, fetchProtected,
  extractMetaImage, extractBiliPageCover, getBvid,
} from '../functions/coverExtract'
import { getYouTubeId } from '../functions/api/extract-cover'
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

// ── Multi-site cover extraction（与 Cloudflare Function extractCover 保持一致）───

async function extractDouyinCover(url: string): Promise<string> {
  const page = await fetchProtected('douyin:' + url, url, { referer: 'https://www.douyin.com/' })
  if (page.status === 200 && page.text) {
    const cover = extractBiliPageCover(page.text)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for douyin link')
}

async function extractKuaishouCover(url: string): Promise<string> {
  const page = await fetchProtected('kuaishou:' + url, url, { referer: 'https://www.kuaishou.com/' })
  if (page.status === 200 && page.text) {
    const cover = extractBiliPageCover(page.text)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for kuaishou link')
}

async function extractTwitterCover(url: string): Promise<string> {
  const proxied = url.replace('//x.com/', '//api.fxtwitter.com/').replace('//twitter.com/', '//api.fxtwitter.com/')
  try {
    const res = await fetchProtected('twitter-api:' + url, proxied)
    if (res.status === 200 && res.text) {
      try {
        const j = JSON.parse(res.text)
        const media = j?.tweet?.media?.photos?.[0]?.url
          || j?.tweet?.media?.videos?.[0]?.thumbnail_url
          || j?.tweet?.media?.all?.[0]?.url
        if (typeof media === 'string' && media) return toHttps(media)
      } catch { /* 非 JSON，继续 */ }
    }
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof UpstreamBlockedError) throw e
  }
  const page = await fetchProtected('twitter-page:' + url, url)
  if (page.status === 200 && page.text) {
    const cover = extractMetaImage(page.text, url)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for twitter link')
}

async function extractCctvCover(url: string): Promise<string> {
  const page = await fetchProtected('cctv:' + url, url, { referer: 'https://tv.cctv.com/' })
  if (page.status === 200 && page.text) {
    const cover = extractBiliPageCover(page.text) || extractMetaImage(page.text, url)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for cctv link')
}

async function extractCover(url: string, hostname: string): Promise<string> {
  if (hostname.endsWith('bilibili.com') || hostname.endsWith('b23.tv')) {
    return extractBilibiliCover(url)
  }
  if (hostname.endsWith('youtube.com') || hostname.endsWith('youtu.be')) {
    const id = getYouTubeId(url)
    if (!id) throw new Error('no youtube video id in url')
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
  }
  if (hostname.endsWith('douyin.com') || hostname.endsWith('iesdouyin.com')) {
    return extractDouyinCover(url)
  }
  if (hostname.endsWith('kuaishou.com') || hostname.endsWith('kuaishou.cn')) {
    return extractKuaishouCover(url)
  }
  if (hostname.endsWith('x.com') || hostname.endsWith('twitter.com')) {
    return extractTwitterCover(url)
  }
  if (hostname.endsWith('cctv.com') || hostname.endsWith('cctv.cn') || hostname.endsWith('cntv.cn')) {
    return extractCctvCover(url)
  }
  return extractGenericCover(url)
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
          const cover = await extractCover(raw, target.hostname)
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
