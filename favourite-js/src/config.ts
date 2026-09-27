// ── 线上 API 配置 ─────────────────────────────────────────────────────────────
// Android / Electron 等原生打包环境没有同源的 /api 前缀，
// 需要指向部署在 Cloudflare Pages 上的 Functions。

/** 线上站点地址（不带末尾斜杠） */
export const PRODUCTION_SITE = 'https://c9ae68e0.favorites-manager.pages.dev'

/**
 * 返回封面提取 API 的基地址。
 * - 浏览器 / Capacitor Webview（http(s) 页面）：用同源相对路径，
 *   dev 时走 Vite 插件、线上走 Pages Functions。
 * - Capacitor 原生容器（capacitor:// / file:// 页面）：无法用相对路径，
 *   回退到线上站点。
 */
export function apiBase(): string {
  if (typeof window === 'undefined') return PRODUCTION_SITE
  const proto = window.location.protocol
  if (proto === 'capacitor:' || proto === 'ionic:' || proto === 'file:') {
    return PRODUCTION_SITE
  }
  return '' // same-origin
}
