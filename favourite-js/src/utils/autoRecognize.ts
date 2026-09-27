// Auto-recognition utility for extracting metadata from URLs and files.
//
// Title/category recognition is purely local and offline: it derives a title
// and a category from the pasted text/link without any network request.
//
// Cover extraction is the ONLY network path: it delegates to the server
// (/api/extract-cover?url=...) which does the actual fetch with browser-like
// headers. Works in both dev (Vite plugin) and production (Cloudflare Pages Functions).

// Common file type mappings to categories
const FILE_TYPE_CATEGORIES: Record<string, string> = {
  // Documents
  '.pdf': 'Document', '.doc': 'Document', '.docx': 'Document', '.txt': 'Document',
  '.md': 'Document', '.rtf': 'Document',
  // Spreadsheets
  '.xls': 'Document', '.xlsx': 'Document', '.csv': 'Document',
  // Presentations
  '.ppt': 'Document', '.pptx': 'Document',
  // Images
  '.jpg': 'Image', '.jpeg': 'Image', '.png': 'Image', '.gif': 'Image',
  '.bmp': 'Image', '.svg': 'Image', '.webp': 'Image', '.ico': 'Image',
  '.tiff': 'Image', '.tif': 'Image',
  '.psd': 'Design', '.ai': 'Design', '.sketch': 'Design', '.fig': 'Design', '.xd': 'Design',
  // Audio
  '.mp3': 'Music', '.wav': 'Music', '.flac': 'Music', '.aac': 'Music',
  '.ogg': 'Music', '.wma': 'Music', '.m4a': 'Music', '.opus': 'Music',
  // Video
  '.mp4': 'Video', '.avi': 'Video', '.mkv': 'Video', '.mov': 'Video',
  '.wmv': 'Video', '.flv': 'Video', '.webm': 'Video', '.m4v': 'Video',
  '.mpg': 'Video', '.mpeg': 'Video', '.3gp': 'Video', '.mts': 'Video',
  // Archives
  '.zip': 'Software', '.rar': 'Software', '.7z': 'Software', '.tar': 'Software',
  '.gz': 'Software', '.bz2': 'Software', '.xz': 'Software', '.iso': 'Software',
  // Code
  '.js': 'Programming', '.ts': 'Programming', '.html': 'Programming', '.css': 'Programming',
  '.py': 'Programming', '.java': 'Programming', '.cpp': 'Programming', '.c': 'Programming',
  '.php': 'Programming', '.rb': 'Programming', '.go': 'Programming', '.rs': 'Programming',
  '.swift': 'Programming', '.kt': 'Programming', '.scala': 'Programming', '.r': 'Programming',
  '.m': 'Programming', '.h': 'Programming', '.hpp': 'Programming', '.cs': 'Programming',
  '.vb': 'Programming', '.lua': 'Programming', '.pl': 'Programming', '.sh': 'Programming',
  '.bat': 'Programming', '.ps1': 'Programming', '.sql': 'Programming', '.json': 'Programming',
  '.xml': 'Programming', '.yaml': 'Programming', '.yml': 'Programming', '.toml': 'Programming',
  '.ini': 'Programming', '.cfg': 'Programming', '.conf': 'Programming', '.vue': 'Programming',
  '.jsx': 'Programming', '.tsx': 'Programming', '.scss': 'Programming', '.sass': 'Programming',
  '.less': 'Programming', '.dart': 'Programming', '.zig': 'Programming', '.nim': 'Programming',
  '.cr': 'Programming', '.ex': 'Programming', '.erl': 'Programming', '.hs': 'Programming',
  '.ml': 'Programming', '.clj': 'Programming', '.lisp': 'Programming', '.el': 'Programming',
  '.rkt': 'Programming',
  // E-books & reading
  '.epub': 'Reading', '.mobi': 'Reading', '.azw': 'Reading', '.azw3': 'Reading',
  '.fb2': 'Reading', '.djvu': 'Reading',
  // Games
  '.unity': 'Game', '.godot': 'Game', '.rpgproject': 'Game', '.sav': 'Game',
  '.gam': 'Game', '.rgssad': 'Game',
  // 3D & modeling
  '.obj': 'Design', '.fbx': 'Design', '.blend': 'Design', '.stl': 'Design',
  '.gltf': 'Design', '.glb': 'Design', '.3ds': 'Design', '.dae': 'Design',
  '.dwg': 'Design', '.dxf': 'Design',
  // Default
  '': 'Other',
}

// Known site categories based on domain patterns
const SITE_CATEGORIES: Record<string, string> = {
  'facebook.com': 'Social', 'twitter.com': 'Social', 'x.com': 'Social', 'instagram.com': 'Social',
  'linkedin.com': 'Social', 'tiktok.com': 'Social', 'pinterest.com': 'Social', 'reddit.com': 'Social',
  'snapchat.com': 'Social', 'telegram.org': 'Social', 't.me': 'Social', 'whatsapp.com': 'Social',
  'line.me': 'Social', 'discord.com': 'Social', 'threads.net': 'Social', 'mastodon.social': 'Social',
  'bsky.app': 'Social',
  'youtube.com': 'Video', 'youtu.be': 'Video', 'vimeo.com': 'Video', 'twitch.tv': 'Video',
  'dailymotion.com': 'Video', 'douyin.com': 'Video', 'v.qq.com': 'Video', 'mgtv.com': 'Video',
  'acfun.cn': 'Video', 'nicovideo.jp': 'Video', 'crunchyroll.com': 'Video', 'hulu.com': 'Video',
  'hbomax.com': 'Video', 'netflix.com': 'Video', 'disneyplus.com': 'Video', 'primevideo.com': 'Video',
  'apple.com': 'Video', 'peacocktv.com': 'Video', 'paramountplus.com': 'Video',
  'spotify.com': 'Music', 'soundcloud.com': 'Music', 'bandcamp.com': 'Music',
  'music.163.com': 'Music', 'music.apple.com': 'Music', 'music.amazon.com': 'Music',
  'deezer.com': 'Music', 'tidal.com': 'Music', 'pandora.com': 'Music', 'last.fm': 'Music',
  'genius.com': 'Music',
  'cnn.com': 'News', 'bbc.com': 'News', 'nytimes.com': 'News', 'theguardian.com': 'News',
  'reuters.com': 'News', 'apnews.com': 'News', 'washingtonpost.com': 'News', 'bloomberg.com': 'News',
  'wsj.com': 'News', 'economist.com': 'News', 'nature.com': 'News', 'sciencemag.org': 'News',
  'arstechnica.com': 'News', 'theverge.com': 'News', 'wired.com': 'News', 'engadget.com': 'News',
  'techcrunch.com': 'News', 'mashable.com': 'News',
  'amazon.com': 'Shopping', 'ebay.com': 'Shopping', 'shopify.com': 'Shopping', 'etsy.com': 'Shopping',
  'walmart.com': 'Shopping', 'target.com': 'Shopping', 'bestbuy.com': 'Shopping',
  'aliexpress.com': 'Shopping', 'wish.com': 'Shopping', 'newegg.com': 'Shopping', 'ikea.com': 'Shopping',
  'homedepot.com': 'Shopping', 'lowes.com': 'Shopping', 'macys.com': 'Shopping',
  'github.com': 'Programming', 'gitlab.com': 'Programming', 'stackoverflow.com': 'Programming',
  'npmjs.com': 'Programming', 'dev.to': 'Programming', 'medium.com': 'Programming',
  'hashnode.dev': 'Programming', 'codepen.io': 'Programming', 'codesandbox.io': 'Programming',
  'replit.com': 'Programming', 'leetcode.com': 'Programming', 'hackerrank.com': 'Programming',
  'codewars.com': 'Programming', 'freecodecamp.org': 'Programming', 'w3schools.com': 'Programming',
  'mozilla.org': 'Programming', 'developer.mozilla.org': 'Programming', 'docs.python.org': 'Programming',
  'docs.oracle.com': 'Programming', 'docs.microsoft.com': 'Programming', 'developer.apple.com': 'Programming',
  'developer.android.com': 'Programming', 'hub.docker.com': 'Programming', 'crates.io': 'Programming',
  'pypi.org': 'Programming', 'rubygems.org': 'Programming', 'packagist.org': 'Programming',
  'nuget.org': 'Programming', 'pub.dev': 'Programming', 'hex.pm': 'Programming',
  'dribbble.com': 'Design', 'behance.net': 'Design', 'figma.com': 'Design', 'adobe.com': 'Design',
  'canva.com': 'Design', 'sketch.com': 'Design', 'invisionapp.com': 'Design', 'zeplin.io': 'Design',
  'unsplash.com': 'Design', 'pexels.com': 'Design', 'pixabay.com': 'Design', 'flaticon.com': 'Design',
  'iconfont.cn': 'Design', 'iconpark.oceanengine.com': 'Design', 'colorhunt.co': 'Design',
  'coolors.co': 'Design', 'zh.dribbble.com': 'Design', 'uisdc.com': 'Design', 'zcool.com.cn': 'Design',
  'coursera.org': 'Education', 'udemy.com': 'Education', 'edx.org': 'Education',
  'khanacademy.org': 'Education', 'ted.com': 'Education', 'duolingo.com': 'Education',
  'brilliant.org': 'Education', 'skillshare.com': 'Education', 'linkedin.com/learning': 'Education',
  'mooc.cn': 'Education', 'icourse163.org': 'Education', 'xuetangx.com': 'Education',
  'bilibili.com': 'Education', 'study.163.com': 'Education', 'imooc.com': 'Education',
  'openai.com': 'AI', 'chat.openai.com': 'AI', 'claude.ai': 'AI', 'anthropic.com': 'AI',
  'bard.google.com': 'AI', 'gemini.google.com': 'AI', 'huggingface.co': 'AI', 'kaggle.com': 'AI',
  'tensorflow.org': 'AI', 'pytorch.org': 'AI', 'midjourney.com': 'AI', 'stability.ai': 'AI',
  'replicate.com': 'AI', 'perplexity.ai': 'AI', 'you.com': 'AI', 'poe.com': 'AI',
  'character.ai': 'AI', 'coze.com': 'AI', 'doubao.com': 'AI', 'tongyi.aliyun.com': 'AI',
  'yiyan.baidu.com': 'AI', 'chatglm.cn': 'AI',
  'store.steampowered.com': 'Game', 'steampowered.com': 'Game', 'epicgames.com': 'Game',
  'gog.com': 'Game', 'itch.io': 'Game', 'roblox.com': 'Game', 'leagueoflegends.com': 'Game',
  'genshin.hoyoverse.com': 'Game', 'genshin.mihoyo.com': 'Game',
  'minecraft.net': 'Game', 'nintendo.com': 'Game', 'playstation.com': 'Game', 'xbox.com': 'Game',
  'gamefaqs.gamespot.com': 'Game', 'ign.com': 'Game', 'gamespot.com': 'Game', 'kotaku.com': 'Game',
  '3dmgame.com': 'Game', 'gamersky.com': 'Game', 'nga.cn': 'Game', 'taptap.cn': 'Game',
  'taptap.io': 'Game', 'xiaoheihe.cn': 'Game',
  'notion.so': 'Tool', 'obsidian.md': 'Tool', 'todoist.com': 'Tool', 'trello.com': 'Tool',
  'asana.com': 'Tool', 'slack.com': 'Tool', 'zoom.us': 'Tool', 'teams.microsoft.com': 'Tool',
  'docs.google.com': 'Tool', 'sheets.google.com': 'Tool', 'drive.google.com': 'Tool',
  'dropbox.com': 'Tool', 'onedrive.live.com': 'Tool', 'airtable.com': 'Tool', 'miro.com': 'Tool',
  'excalidraw.com': 'Tool', 'regex101.com': 'Tool', 'crontab.guru': 'Tool',
  'jsonformatter.org': 'Tool', 'tinypng.com': 'Tool', 'convertio.co': 'Tool', 'remove.bg': 'Tool',
  'deepl.com': 'Tool', 'fanyi.baidu.com': 'Tool', 'translate.google.com': 'Tool',
  'grammarly.com': 'Tool', 'quillbot.com': 'Tool',
  'substack.com': 'Reading', 'ghost.org': 'Reading', 'wordpress.com': 'Reading',
  'blogger.com': 'Reading', 'notion.site': 'Reading', 'gutenberg.org': 'Reading',
  'archive.org': 'Reading', 'wikipedia.org': 'Reading', 'wikiwand.com': 'Reading',
  'wolframalpha.com': 'Reading', 'scholar.google.com': 'Reading', 'zhihu.com': 'Reading',
  'juejin.cn': 'Reading', 'segmentfault.com': 'Reading', 'oschina.net': 'Reading',
  'v2ex.com': 'Reading', 'hackernews.com': 'Reading', 'news.ycombinator.com': 'Reading',
  'producthunt.com': 'Reading', 'lobste.rs': 'Reading', 'digg.com': 'Reading', 'slashdot.org': 'Reading',
  'google.com': 'Search', 'bing.com': 'Search', 'duckduckgo.com': 'Search', 'yahoo.com': 'Search',
  'ecosia.org': 'Search', 'startpage.com': 'Search', 'sogou.com': 'Search', 'so.com': 'Search',
  'yandex.com': 'Search',
  'weibo.com': 'Social', 'qq.com': 'Social',
  'taobao.com': 'Shopping', 'jd.com': 'Shopping', 'tmall.com': 'Shopping',
  'iqiyi.com': 'Video', 'youku.com': 'Video',
  'sohu.com': 'News', 'sina.com.cn': 'News', '163.com': 'News',
  'gitee.com': 'Programming', 'coding.net': 'Programming',
  'jianshu.com': 'Reading', 'toutiao.com': 'News', '36kr.com': 'News', 'huxiu.com': 'News',
  'ifanr.com': 'News', 'sspai.com': 'Tool', 'coolapk.com': 'Tool',
  'smzdm.com': 'Shopping', 'meituan.com': 'Shopping', 'eleme.cn': 'Shopping', 'dianping.com': 'Shopping',
  'ctrip.com': 'Tool', '12306.cn': 'Tool', 'amap.com': 'Tool', 'map.baidu.com': 'Tool',
  '': 'Other',
}

// ── Local-only helpers ────────────────────────────────────────────────────────

export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/)
  return match ? `.${match[1].toLowerCase()}` : ''
}

export function getCategoryFromFileExtension(extension: string): string {
  return FILE_TYPE_CATEGORIES[extension] || FILE_TYPE_CATEGORIES['']
}

export function getTitleFromFilename(filename: string): string {
  let title = filename.replace(/\.[^/.]+$/, '')
  title = title.replace(/[_-]/g, ' ')
  title = title.trim()
  return title || filename
}

function cleanShareLink(input: string): string {
  const urlMatch = input.match(/(https?:\/\/[^\s]+)/)
  if (urlMatch) return urlMatch[0]
  return input
}

export function getCategoryFromSite(hostname: string): string {
  const cleanHostname = hostname.replace(/^www\./, '')
  if (SITE_CATEGORIES[cleanHostname]) return SITE_CATEGORIES[cleanHostname]
  for (const [domain, category] of Object.entries(SITE_CATEGORIES)) {
    if (cleanHostname.includes(domain)) return category
  }
  return SITE_CATEGORIES['']
}

function localMetadataFromInput(input: string): { title: string; description?: string } {
  let extractedTitle = ''
  const urlMatch = input.match(/(https?:\/\/[^\s]+)/)
  if (urlMatch) {
    const matchedUrl = urlMatch[0]
    const start = input.indexOf(matchedUrl)
    const before = input.substring(0, start).trim()
    const after = input.substring(start + matchedUrl.length).trim()
    const parts: string[] = []
    if (before && !/^[\s\-–——【\[「『》」』\]]+$/.test(before)) parts.push(before)
    if (after && !/^[\s\-–——【\[「『》」』\]]+$/.test(after)) parts.push(after)
    if (parts.length) extractedTitle = parts.join(' ')
  }
  if (!extractedTitle) {
    const bracketPatterns = [
      /[【\[「『]([^】\]」』]+)[】\]」』]/,
      /《([^》]+)》/,
    ]
    for (const pattern of bracketPatterns) {
      const match = input.match(pattern)
      if (match?.[1] && match[1].trim()) {
        extractedTitle = match[1].trim()
        break
      }
    }
  }
  if (extractedTitle) {
    extractedTitle = extractedTitle
      .replace(/^[【\[「『]+/, '')
      .replace(/[】\]」』]+$/, '')
      .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
    if (extractedTitle.length > 100) extractedTitle = extractedTitle.substring(0, 100) + '...'
    return { title: extractedTitle }
  }
  try {
    const url = input.match(/(https?:\/\/[^\s]+)/)?.[0] || input
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return { title: hostname.replace(/[._-]/g, ' ') || input }
  } catch {
    return { title: input }
  }
}

// ── Cover extraction (delegates to Vite plugin backend) ───────────────────────

function getYouTubeId(url: string): string | undefined {
  const patterns = [
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return undefined
}

function toHttps(url: string): string {
  return url.replace(/^http:/i, 'https:')
}

async function extractCoverViaBackend(url: string): Promise<string> {
  const MAX_RETRIES = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
    try {
      const res = await fetch('/api/extract-cover?url=' + encodeURIComponent(url), {
        signal: AbortSignal.timeout(12000),
      })
      // If the API route isn't deployed (e.g. Cloudflare Pages Functions missing),
      // the SPA fallback returns index.html. Detect it and raise a clear error
      // instead of a confusing "Unexpected token '<'" JSON parse failure.
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('text/html')) {
        throw new Error(
          '封面服务不可用（接口返回了网页而非 JSON）。'
          + '如果你在使用 Cloudflare Pages，请确认部署时包含了 functions/ 目录，'
          + '详见仓库中的 DEPLOY.md。'
        )
      }
      const j = (await res.json()) as { cover?: string; error?: string }
      if (res.ok && typeof j.cover === 'string' && j.cover) return j.cover
      // Don't retry client errors (4xx) — they're deterministic
      if (res.status >= 400 && res.status < 500) {
        throw new Error(j.error || 'backend cover failed: HTTP ' + res.status)
      }
      // 5xx — retryable
      lastError = new Error(j.error || 'backend cover failed: HTTP ' + res.status)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        lastError = new Error('封面提取超时，请稍后重试')
      } else if (e instanceof Error) {
        lastError = e
      } else {
        lastError = new Error('封面提取失败')
      }
      // Deployment errors are deterministic — do not retry
      if (lastError.message.includes('封面服务不可用')) break
      // Network errors are retryable
    }
  }
  throw lastError || new Error('封面提取失败')
}

export async function extractCoverFromUrl(input: string): Promise<string> {
  const url = cleanShareLink(input)
  const ytId = getYouTubeId(url)
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
  return await extractCoverViaBackend(url)
}

// ── Main auto-recognize entry point (local-only, no network) ─────────────────

export async function autoRecognizeItem(
  input: string,
  itemType: 'link' | 'file'
): Promise<{
  title: string
  urlOrPath: string
  category: string
  summary?: string
}> {
  if (itemType === 'link') {
    const cleanedUrl = cleanShareLink(input)
    let hostname = ''
    try { hostname = new URL(cleanedUrl).hostname.toLowerCase() } catch { /* heuristics below */ }
    const local = localMetadataFromInput(input)
    return {
      title: local.title || cleanedUrl,
      urlOrPath: cleanedUrl,
      category: getCategoryFromSite(hostname) || 'Other',
      summary: local.description || '',
    }
  } else {
    const filename = input.split(/[\/]/).pop() || input
    const title = getTitleFromFilename(filename)
    const extension = getFileExtension(filename)
    const category = getCategoryFromFileExtension(extension)
    return { title, urlOrPath: input, category, summary: `File type: ${extension || 'unknown'}` }
  }
}
