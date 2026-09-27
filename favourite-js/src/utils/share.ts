// ── 分享文本解析 ─────────────────────────────────────────────────────────────
// 系统分享来的文本通常是「标题 + 换行 + URL」或纯 URL，例如：
//   【标题】 https://www.bilibili.com/video/BV...
//   https://v.douyin.com/xxx
// 这里提取 URL 并复用 autoRecognize 的本地识别逻辑得到标题/分类。

import { autoRecognizeItem } from './autoRecognize'

export interface ParsedShare {
  url: string
  title: string
  category: string
}

/** 同步提取 URL；标题/分类需要异步识别，见 parseShareAsync */
export function extractShareUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s，。、）】」』"']+/i)
  return m ? m[0].replace(/[),.]+$/, '') : text.trim()
}

/**
 * 解析分享文本：提取 URL，并对 URL 做本地（无网络）标题/分类识别。
 * autoRecognizeItem 本身就是纯本地逻辑，直接 await 即可。
 */
export async function parseShareAsync(text: string): Promise<ParsedShare> {
  const url = extractShareUrl(text)
  try {
    const result = await autoRecognizeItem(url, 'link')
    return {
      url: result.urlOrPath || url,
      title: result.title || url,
      category: result.category || 'Other',
    }
  } catch {
    return { url, title: text.trim(), category: 'Other' }
  }
}

/** 同步版：仅提取 URL，标题先用分享文本的清洗结果占位（弹窗打开后可再异步细化） */
export function cleanShareText(text: string): ParsedShare {
  const url = extractShareUrl(text)
  // 去掉 URL 后剩余部分作为候选标题
  const leftover = text.replace(/https?:\/\/[^\s]+/gi, '').trim()
  const title = (leftover || url).replace(/^[【\[「『]+|[】\]」』]+$/g, '').trim()
  return { url, title, category: 'Other' }
}
