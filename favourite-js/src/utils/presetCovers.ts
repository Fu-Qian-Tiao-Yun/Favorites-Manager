// Preset cover definitions for collection items.
// Preset covers are stored as `preset:<key>` strings (e.g. `preset:video`) so
// they can be rendered as a solid background color + a category icon anywhere.

import { apiBase } from '../config'
import {
  VideoCameraOutlined,
  PictureOutlined,
  AudioOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  CodeOutlined,
  BgColorsOutlined,
  StarOutlined,
  TeamOutlined,
  ReadOutlined,
  ShoppingCartOutlined,
  SearchOutlined,
  ExperimentOutlined,
  TrophyOutlined,
  RobotOutlined,
  ToolOutlined,
  BookOutlined,
} from '@ant-design/icons'
import type { ComponentType, CSSProperties } from 'react'

export interface PresetCover {
  key: string
  /** Solid background color */
  color: string
  /** Category icon rendered on top of the color */
  icon: ComponentType<{ style?: CSSProperties }>
  /** i18n key for the cover label */
  i18nKey: string
}

export const PRESET_PREFIX = 'preset:'

export const PRESET_COVERS: PresetCover[] = [
  { key: 'video', color: '#F5222D', icon: VideoCameraOutlined, i18nKey: 'preset_video' },
  { key: 'image', color: '#FA8C16', icon: PictureOutlined, i18nKey: 'preset_image' },
  { key: 'music', color: '#722ED1', icon: AudioOutlined, i18nKey: 'preset_music' },
  { key: 'document', color: '#1890FF', icon: FileTextOutlined, i18nKey: 'preset_document' },
  { key: 'software', color: '#52C41A', icon: AppstoreOutlined, i18nKey: 'preset_software' },
  { key: 'programming', color: '#13C2C2', icon: CodeOutlined, i18nKey: 'preset_programming' },
  { key: 'design', color: '#EB2F96', icon: BgColorsOutlined, i18nKey: 'preset_design' },
  { key: 'social', color: '#1890FF', icon: TeamOutlined, i18nKey: 'preset_social' },
  { key: 'news', color: '#FA541C', icon: ReadOutlined, i18nKey: 'preset_news' },
  { key: 'shopping', color: '#F5222D', icon: ShoppingCartOutlined, i18nKey: 'preset_shopping' },
  { key: 'search', color: '#722ED1', icon: SearchOutlined, i18nKey: 'preset_search' },
  { key: 'education', color: '#13C2C2', icon: ExperimentOutlined, i18nKey: 'preset_education' },
  { key: 'game', color: '#FA8C16', icon: TrophyOutlined, i18nKey: 'preset_game' },
  { key: 'ai', color: '#52C41A', icon: RobotOutlined, i18nKey: 'preset_ai' },
  { key: 'tool', color: '#8C8C8C', icon: ToolOutlined, i18nKey: 'preset_tool' },
  { key: 'reading', color: '#EB2F96', icon: BookOutlined, i18nKey: 'preset_reading' },
  { key: 'other', color: '#8C8C8C', icon: StarOutlined, i18nKey: 'preset_other' },
]

/** Builds the stored cover value for a preset key, e.g. `preset:video` */
export const presetCoverValue = (key: string): string => `${PRESET_PREFIX}${key}`

export const isPresetCover = (value?: string | null): boolean =>
  !!value && value.startsWith(PRESET_PREFIX)

/** Extracts the preset key from a stored cover value, or null if not a preset */
export const getPresetCoverKey = (value?: string | null): string | null =>
  isPresetCover(value) ? (value as string).slice(PRESET_PREFIX.length) : null

/**
 * Resolves a stored cover value to its preset definition.
 * Unknown/legacy preset keys fall back to the neutral "other" cover.
 */
export const getPresetCover = (value?: string | null): PresetCover | null => {
  const key = getPresetCoverKey(value)
  if (!key) return null
  return PRESET_COVERS.find((cover) => cover.key === key) || PRESET_COVERS[PRESET_COVERS.length - 1]
}

/** Legacy preset covers were stored as CSS gradients */
export const isGradientCover = (value?: string | null): boolean =>
  !!value && (value.startsWith('linear-gradient') || value.startsWith('radial-gradient'))

/** True when the stored cover is an actual image (URL or base64 data URL) */
export const isImageCover = (value?: string | null): boolean =>
  !!value && !isPresetCover(value) && !isGradientCover(value)

// The server (/api/cover-img) proxies cover
// images server-side. Remote http(s) covers are routed through it so
// hotlink-protected CDNs (hdslb, bilibili, etc.) load reliably. The stored
// value stays the original URL; only the rendered src is rewritten.
// Local data URLs pass through unchanged.
export const proxiedCoverUrl = (value?: string | null): string => {
  if (!value || value.startsWith('data:')) return value || ''
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return `${apiBase()}/api/cover-img?url=${encodeURIComponent(value)}`
  }
  return value
}

/** Default preset key for a given item type */
export const getDefaultPresetCoverKey = (itemType: 'link' | 'file'): string =>
  itemType === 'file' ? 'document' : 'video'
