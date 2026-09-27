import { Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { useUIStore } from './stores/uiStore'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ItemsPage from './pages/ItemsPage'
import SettingsPage from './pages/SettingsPage'
import AboutPage from './pages/AboutPage'
import ShareHandler from './utils/shareHandler'

const { darkAlgorithm } = theme

function App() {
  const { language, darkMode, themeColor } = useUIStore()

  return (
    <ConfigProvider
      locale={language === 'zh' ? zhCN : enUS}
      theme={{
        token: {
          colorPrimary: themeColor,
          borderRadius: 8,
        },
        algorithm: darkMode ? darkAlgorithm : undefined,
      }}
    >
      <div className={darkMode ? 'dark-theme' : 'light-theme'}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="folder/:id" element={<ItemsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        {/* 手机端系统分享接收：监听 Capacitor 插件并弹出收藏流程 */}
        <ShareHandler />
      </div>
    </ConfigProvider>
  )
}

export default App
