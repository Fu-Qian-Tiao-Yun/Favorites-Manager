import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Config {
  language: 'zh' | 'en'
  themeColor: string
  darkMode: boolean
  /** 用户自定义添加的主题色（取色板保存的颜色） */
  customColors: string[]
  /** 收藏夹卡片图标颜色自动同步主题色；关闭后使用收藏夹自己的颜色 */
  folderIconSyncTheme: boolean
}

interface UIState extends Config {
  setLanguage: (lang: 'zh' | 'en') => void
  setThemeColor: (color: string) => void
  setDarkMode: (dark: boolean) => void
  toggleDarkMode: () => void
  addCustomColor: (color: string) => void
  removeCustomColor: (color: string) => void
  setFolderIconSyncTheme: (sync: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      language: 'en',
      themeColor: '#0078d7',
      darkMode: false,
      customColors: [],
      folderIconSyncTheme: true,
      
      setLanguage: (lang) => set({ language: lang }),
      setThemeColor: (color) => set({ themeColor: color }),
      setDarkMode: (dark) => set({ darkMode: dark }),
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      addCustomColor: (color) =>
        set((state) => ({
          customColors: state.customColors.includes(color)
            ? state.customColors
            : [...state.customColors, color].slice(-24), // 最多保留 24 个自定义色
        })),
      removeCustomColor: (color) =>
        set((state) => ({ customColors: state.customColors.filter((c) => c !== color) })),
      setFolderIconSyncTheme: (sync) => set({ folderIconSyncTheme: sync }),
    }),
    {
      name: 'favourite-ui-config',
    }
  )
)
