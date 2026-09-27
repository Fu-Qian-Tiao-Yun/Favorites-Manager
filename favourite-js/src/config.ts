// ── 线上 API 配置 ─────────────────────────────────────────────────────────────
// Android / Electron 等原生打包环境没有同源的 /api 前缀，
// 需要指向部署在 Cloudflare Pages 上的 Functions。

/** 线上站点地址（不带末尾斜杠） */
export const PRODUCTION_SITE = 'https://c9ae68e0.favorites-manager.pages.dev'

/**
 * 是否运行在 Electron 打包环境中。
 * capacitor-electron 运行时通过自定义协议 `capacitor-electron://` 加载页面，
 * 此时相对路径 /api/* 会命中该协议下的 SPA 回退而不是后端接口。
 */
export function isElectronEnv(): boolean {
  if (typeof navigator === 'undefined') return false
  if (navigator.userAgent?.includes('Electron')) return true
  // 兜底：preload 注入的 API 存在即认为在 Electron 中
  return typeof window !== 'undefined' && 'electronAPI' in window
}

/**
 * 返回封面提取 API 的基地址。
 * - 浏览器 / Capacitor Webview（http(s) 页面）：用同源相对路径，
 *   dev 时走 Vite 插件、线上走 Pages Functions。
 * - Capacitor 原生容器（capacitor:// / ionic:// / file:// 页面）
 *   以及 Electron（capacitor-electron:// 页面）：无法用相对路径，
 *   回退到线上站点（Pages Functions 已开放 CORS，跨域可用）。
 */
export function apiBase(): string {
  if (typeof window === 'undefined') return PRODUCTION_SITE
  const proto = window.location.protocol
  if (
    proto === 'capacitor:' ||
    proto === 'ionic:' ||
    proto === 'file:' ||
    proto === 'capacitor-electron:' ||
    isElectronEnv()
  ) {
    return PRODUCTION_SITE
  }
  return '' // same-origin
}
