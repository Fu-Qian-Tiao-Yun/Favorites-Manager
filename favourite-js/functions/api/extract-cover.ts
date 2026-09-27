// Cloudflare Pages Function — /api/extract-cover?url=<encoded url>
// Returns JSON { cover } or { error }.
// Imports shared logic from ../coverExtract.ts and ../rateLimit.ts.

import {
  toHttps, fetchProtected,
  extractMetaImage, extractBiliPageCover, getBvid,
} from '../coverExtract'
import { RateLimitError, UpstreamBlockedError } from '../rateLimit'

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function friendlyError(err: unknown): { status: number; message: string } {
  if (err instanceof RateLimitError) {
    return { status: 429, message: `请求过于频繁，请 ${err.retryAfterSec} 秒后重试` }
  }
  if (err instanceof UpstreamBlockedError) {
    return { status: 503, message: err.message }
  }
  const msg = err instanceof Error ? err.message : String(err)
  // "no cover found" is not a server error — it's a 404
  if (msg.includes('no cover found') || msg.includes('no bvid')) {
    return { status: 404, message: '无法提取封面，请手动设置' }
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('connect')) {
    return { status: 502, message: '无法连接到目标服务器' }
  }
  if (msg.includes('abort') || msg.includes('timeout') || msg.includes('timed out')) {
    return { status: 504, message: '请求超时，请稍后重试' }
  }
  if (msg.includes('body too large') || msg.includes('response too large')) {
    return { status: 413, message: '响应内容过大' }
  }
  // Log unexpected errors for debugging
  console.error('[extract-cover] unexpected error:', err)
  return { status: 500, message: msg || '封面提取失败' }
}

// ── Bilibili cover extraction (API → page og:image → player API) ─────────────

async function extractBilibiliCover(videoUrl: string): Promise<string> {
  const bvid = getBvid(videoUrl)
  if (!bvid) throw new Error('no bvid in url')

  console.log(`[extract-cover] bilibili cover extraction for bvid=${bvid}`)

  // 1) Official API — the most reliable source for video cover
  try {
    const api = await fetchProtected(
      'bili-api:' + bvid,
      'https://api.bilibili.com/x/web-interface/view?bvid=' + bvid,
      { referer: 'https://www.bilibili.com/' },
    )
    console.log(`[extract-cover] bili-api: status=${api.status}, text_len=${api.text?.length || 0}`)
    if (api.status === 200 && api.text) {
      let j: any = null
      try { j = JSON.parse(api.text) } catch { j = null }
      if (j) console.log(`[extract-cover] bili-api code=${j.code}, has_pic=${!!j.data?.pic}`)
      if (j?.code === 0 && typeof j.data?.pic === 'string' && j.data.pic) return toHttps(j.data.pic)
      if (j?.code === 0 && typeof j.data?.pages?.[0]?.first_frame === 'string' && j.data.pages[0].first_frame) return toHttps(j.data.pages[0].first_frame)
    }
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof UpstreamBlockedError) throw e
    console.warn('[extract-cover] bilibili API error:', e instanceof Error ? e.message : e)
  }

  // 2) Video page HTML — extract og:image meta tag
  try {
    const page = await fetchProtected(
      'bili-page:' + bvid,
      videoUrl,
      { referer: 'https://www.bilibili.com/' },
    )
    console.log(`[extract-cover] bili-page: status=${page.status}, text_len=${page.text?.length || 0}`)
    if (page.status === 200 && page.text) {
      const cover = extractBiliPageCover(page.text)
      if (cover) {
        console.log(`[extract-cover] bili-page: found cover via meta tag`)
        return toHttps(cover)
      }
    }
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof UpstreamBlockedError) throw e
    console.warn('[extract-cover] bilibili page error:', e instanceof Error ? e.message : e)
  }

  // 3) Player API — last resort
  try {
    const api2 = await fetchProtected(
      'bili-player:' + bvid,
      'https://api.bilibili.com/x/player/pic?bvid=' + bvid,
      { referer: 'https://www.bilibili.com/video/' + bvid },
    )
    console.log(`[extract-cover] bili-player: status=${api2.status}, text_len=${api2.text?.length || 0}`)
    if (api2.status === 200 && api2.text) {
      let j: any = null
      try { j = JSON.parse(api2.text) } catch { j = null }
      if (j) console.log(`[extract-cover] bili-player code=${j.code}, has_data=${typeof j.data}`)
      if (j?.code === 0 && typeof j.data === 'string' && j.data) return toHttps(j.data)
    }
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof UpstreamBlockedError) throw e
    console.warn('[extract-cover] bilibili player API error:', e instanceof Error ? e.message : e)
  }

  console.error(`[extract-cover] all bilibili strategies failed for bvid=${bvid}`)
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

// ── Cloudflare Pages Function handler ────────────────────────────────────────

// Minimal shape of the Cloudflare Pages Function context — avoids adding a
// build-time dependency on @cloudflare/workers-types.
interface PagesFunctionContext {
  request: Request
}

export const onRequest = async (context: PagesFunctionContext) => {
  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const url = new URL(context.request.url)
  const raw = url.searchParams.get('url')
  if (!raw) return jsonResponse({ error: 'missing url' }, 400)

  let target: URL
  try { target = new URL(raw) } catch { return jsonResponse({ error: 'invalid url' }, 400) }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return jsonResponse({ error: 'unsupported protocol' }, 400)
  }

  try {
    const isBili = target.hostname.endsWith('bilibili.com')
    console.log(`[extract-cover] ${isBili ? 'bilibili' : 'generic'} cover extraction for: ${target.hostname}`)
    const cover = isBili ? await extractBilibiliCover(raw) : await extractGenericCover(raw)
    return jsonResponse({ cover })
  } catch (err) {
    const { status, message } = friendlyError(err)
    console.error(`[extract-cover] failed (${status}): ${message}`)
    return jsonResponse({ error: message }, status)
  }
}
