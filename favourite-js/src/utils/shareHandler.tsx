// ── 手机端系统分享接收 ────────────────────────────────────────────────────────
// Android 端 ShareReceiverPlugin 把 ACTION_SEND 的文本转发到 WebView。
// 这里监听插件事件 / 冷启动拉取 pending 分享，然后弹出
// 「选择收藏夹 → 预填好的添加收藏项窗口」流程。

import { useEffect, useState, useCallback, useRef } from 'react'
import { useDBStore } from '../stores/dbStore'
import { autoRecognizeItem } from '../utils/autoRecognize'
import ShareTargetDialog from '../components/ShareTargetDialog'

/** Capacitor 插件类型（Android 端 ShareReceiverPlugin） */
interface ShareReceiverPlugin {
  getPendingShare: () => Promise<{ text?: string }>
  addListener: (
    event: 'shareReceived',
    listener: (data: { text?: string }) => void,
  ) => Promise<{ remove: () => void }> & { remove: () => void }
}

interface CapacitorGlobal {
  Plugins?: Record<string, unknown>
}

export default function ShareHandler() {
  const folders = useDBStore((s) => s.folders)
  const loadFolders = useDBStore((s) => s.loadFolders)

  // 分享的原始文本（通常是带标题的分享文案，如「【视频标题】 https://...」）
  const [sharedText, setSharedText] = useState<string | null>(null)
  const handledRef = useRef(false)

  const openShare = useCallback((text: string) => {
    if (!text || !text.trim()) return
    handledRef.current = false
    setSharedText(text)
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
    const plugin = cap?.Plugins?.['ShareReceiver'] as ShareReceiverPlugin | undefined

    if (plugin && typeof plugin.addListener === 'function') {
      // 热启动：应用已在后台运行时收到新分享
      plugin.addListener('shareReceived', (data) => {
        if (data?.text) openShare(data.text)
      })
      // 冷启动：WebView 就绪后主动拉取
      if (typeof plugin.getPendingShare === 'function') {
        plugin.getPendingShare().then((data) => {
          if (data?.text && !handledRef.current) openShare(data.text)
        }).catch(() => {})
      }
      return undefined
    }
    // 浏览器环境（dev/线上）不支持分享接收，静默跳过
    return undefined
  }, [openShare])

  const handleClose = () => setSharedText(null)

  // 只在有分享且收藏夹已加载时渲染
  if (!sharedText) return null

  return (
    <ShareTargetDialog
      open
      sharedText={sharedText}
      folders={folders}
      onClose={handleClose}
    />
  )
}
