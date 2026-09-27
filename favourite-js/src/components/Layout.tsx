import { useNavigate, useLocation } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { Layout as AntLayout, Button, Typography, Space } from 'antd'
import { 
  HomeOutlined, 
  SettingOutlined, 
  InfoCircleOutlined,
  BulbOutlined 
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import PageTransition from './PageTransition'

const { Header, Content, Footer } = AntLayout
const { Title } = Typography

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { darkMode, toggleDarkMode, themeColor } = useUIStore()

  const pathname = location.pathname

  // Top-right nav buttons: the current page's button gets a themed translucent
  // border, and clicking it again does nothing (no re-navigation / no replay of
  // the page transition)
  const navStyle = (active: boolean): CSSProperties => ({
    color: darkMode ? '#fff' : '#333',
    border: active ? `1px solid ${themeColor}80` : '1px solid transparent',
  })
  const go = (path: string) => {
    if (pathname !== path) navigate(path)
  }

  return (
    <AntLayout 
      style={{ 
        minHeight: '100vh',
        background: darkMode ? '#1a1a1a' : '#f5f5f5'
      }}
    >
      <Header 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: darkMode ? '#262626' : '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          padding: '0 var(--page-pad)',
          height: 'var(--app-header-h)',
          lineHeight: 'var(--app-header-h)',
          // The app menu stays visible on every page while the content scrolls
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 16 }}
          onClick={() => {
            if (pathname !== '/') navigate('/')
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <img
              src="/icon.png"
              alt=""
              style={{
                width: '1.5rem',
                height: '1.5rem',
                display: 'block',
                flexShrink: 0,
              }}
            />
            <Title
              level={4}
              style={{
                margin: 0,
                color: darkMode ? '#fff' : '#333',
                cursor: 'pointer',
                // Shrink with the screen width (min 1.125rem, max 1.5rem)
                fontSize: 'clamp(1.125rem, 4.5vw, 1.5rem)',
                lineHeight: 1.2,
              }}
            >
              {t('window_title')}
            </Title>
          </div>
        </div>

        <Space size={8}>
          <Button 
            icon={<HomeOutlined />}
            onClick={() => go('/')}
            type="text"
            style={navStyle(pathname === '/')}
          >
            <span className="nav-btn-label">{t('Home')}</span>
          </Button>
          
          <Button 
            icon={<SettingOutlined />}
            onClick={() => go('/settings')}
            type="text"
            style={navStyle(pathname === '/settings')}
          >
            <span className="nav-btn-label">{t('settings_title')}</span>
          </Button>
          
          <Button 
            icon={<InfoCircleOutlined />}
            onClick={() => go('/about')}
            type="text"
            style={navStyle(pathname === '/about')}
          >
            <span className="nav-btn-label">{t('about')}</span>
          </Button>
          
          <Button
            icon={<BulbOutlined />}
            onClick={toggleDarkMode}
            type="text"
            style={{ color: darkMode ? '#fff' : '#333' }}
          >
            {darkMode ? '☀️' : '🌙'}
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: 'var(--page-pad)', minHeight: 'calc(100vh - var(--app-header-h) - var(--app-footer-h))' }}>
        <PageTransition />
      </Content>

      <Footer 
        style={{ 
          textAlign: 'center',
          background: darkMode ? '#262626' : '#fff',
          color: darkMode ? '#999' : '#666',
          height: 'var(--app-footer-h)',
          lineHeight: 'var(--app-footer-h)',
          padding: '0 var(--page-pad)'
        }}
      >
        v1.0.1 | Made By FuQian
      </Footer>
    </AntLayout>
  )
}
