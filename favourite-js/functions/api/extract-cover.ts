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

// ── YouTube ─────────────────────────────────────────────────────────────────
// 缩略图直接由 img.youtube.com 提供，无需抓取页面。

export function getYouTubeId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return ''
}

// ── Douyin（抖音）─────────────────────────────────────────────────────────────
// 抖音分享链接（v.douyin.com/xxx）302 到真实视频页；页面 og:image 可用。
// 抓取时必须带浏览器 UA + Cookie，否则拿到的是验证页。

async function extractDouyinCover(url: string): Promise<string> {
  const page = await fetchProtected('douyin:' + url, url, { referer: 'https://www.douyin.com/' })
  if (page.status === 200 && page.text) {
    const cover = extractBiliPageCover(page.text)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for douyin link')
}

// ── Kuaishou（快手）───────────────────────────────────────────────────────────

async function extractKuaishouCover(url: string): Promise<string> {
  const page = await fetchProtected('kuaishou:' + url, url, { referer: 'https://www.kuaishou.com/' })
  if (page.status === 200 && page.text) {
    const cover = extractBiliPageCover(page.text)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for kuaishou link')
}

// ── Twitter / X ──────────────────────────────────────────────────────────────
// x.com 页面是 JS 渲染，og:image 需要绕过。 syndication API 已收紧，
// 这里退回抓取页面并用 metatags 兼容（twitter:image 也可能出现在 SSR 响应里）。

async function extractTwitterCover(url: string): Promise<string> {
  // fxtwitter / vxtwitter 代理返回稳定的 og:image，无需登录
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
  // 兜底：抓原页 og:image
  const page = await fetchProtected('twitter-page:' + url, url)
  if (page.status === 200 && page.text) {
    const cover = extractMetaImage(page.text, url)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for twitter link')
}

// ── 央视网 ──────────────────────────────────────────────────────────────────
//央视页面为 SSR，og:image 可直接提取；部分老页面用 image_src link 标签。

async function extractCctvCover(url: string): Promise<string> {
  const page = await fetchProtected('cctv:' + url, url, { referer: 'https://tv.cctv.com/' })
  if (page.status === 200 && page.text) {
    const cover = extractBiliPageCover(page.text) || extractMetaImage(page.text, url)
    if (cover) return toHttps(cover)
  }
  throw new Error('no cover found for cctv link')
}

// ── 站点路由 ────────────────────────────────────────────────────────────────

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
    console.log(`[extract-cover] cover extraction for: ${target.hostname}`)
    const cover = await extractCover(raw, target.hostname)
    return jsonResponse({ cover })
  } catch (err) {
    const { status, message } = friendlyError(err)
    console.error(`[extract-cover] failed (${status}): ${message}`)
    return jsonResponse({ error: message }, status)
  }
}
