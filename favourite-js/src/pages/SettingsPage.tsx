import { Typography, Card, Button, Space, message, Divider, Alert, Switch, ColorPicker, Modal, List, Empty, Input } from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  ClearOutlined,
  UndoOutlined,
  InboxOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useRef, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useDBStore } from '../stores/dbStore'
import {
  exportData,
  importData,
  moveAllToTrash,
  getTrash,
  restoreFromTrash,
  purgeTrashEntry,
  emptyTrash,
  TRASH_RETENTION_MS,
  type TrashEntry,
} from '../core/database'

const { Title, Text } = Typography

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const {
    language,
    darkMode,
    themeColor,
    customColors,
    folderIconSyncTheme,
    setLanguage,
    setThemeColor,
    setDarkMode,
    addCustomColor,
    removeCustomColor,
    setFolderIconSyncTheme,
  } = useUIStore()

  const { folders, loadFolders: reloadFolders } = useDBStore()

  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([])
  const [importText, setImportText] = useState('')
  const [importModalOpen, setImportModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const colors = [
    '#0078d7', '#00a4ef', '#00b294', '#00cfc8',
    '#5c2d91', '#e3008c', '#d13438', '#ff8c00',
    '#107c10', '#7a7574', '#404040', '#8764b8'
  ]

  const handleLanguageChange = (lang: 'en' | 'zh') => {
    setLanguage(lang)
    i18n.changeLanguage(lang)
    message.success(t('success_update'))
  }

  const handleColorChange = (color: string) => {
    setThemeColor(color)
    message.success(t('success_update'))
  }

  const handleColorPicker = (value: any) => {
    const hex = typeof value === 'string' ? value : value?.toHexString?.()
    if (!hex) return
    handleColorChange(hex)
  }

  const handleColorPickerClose = () => {
    setColorPickerOpen(false)
    // 把最终选定的颜色加入自定义色板（去重由 store 处理）
    if (themeColor && !colors.includes(themeColor)) {
      addCustomColor(themeColor)
    }
  }

  // ── 导出 ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    try {
      const json = exportData()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `favourites-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      message.success(t('export_success'))
    } catch (err) {
      console.error('Export failed:', err)
      message.error(t('export_failed'))
    }
  }

  // ── 导入（文件）──────────────────────────────────────────────────────────
  const handleImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        importData(reader.result as string)
        reloadFolders()
        message.success(t('import_success'))
      } catch (err) {
        console.error('Import failed:', err)
        message.error(t('import_failed'))
      }
    }
    reader.onerror = () => message.error(t('import_failed'))
    reader.readAsText(file)
    return false // prevent antd auto upload
  }

  // ── 导入（粘贴文本）───────────────────────────────────────────────────────
  const handleImportText = () => {
    try {
      importData(importText)
      reloadFolders()
      setImportModalOpen(false)
      setImportText('')
      message.success(t('import_success'))
    } catch (err) {
      console.error('Import failed:', err)
      message.error(t('import_failed'))
    }
  }

  // ── 一键清理 ──────────────────────────────────────────────────────────────
  const handleClearAll = () => {
    Modal.confirm({
      title: t('clear_all_title'),
      content: t('clear_all_confirm', { count: folders.length }),
      okText: t('confirm'),
      okButtonProps: { danger: true },
      cancelText: t('cancel'),
      onOk: () => {
        try {
          const count = moveAllToTrash()
          reloadFolders()
          message.success(t('clear_all_done', { count }))
        } catch (err) {
          console.error('Clear all failed:', err)
          message.error(t('error_occurred'))
        }
      },
    })
  }

  // ── 回收站 ────────────────────────────────────────────────────────────────
  const refreshTrash = () => setTrashEntries(getTrash())

  const handleOpenTrash = () => {
    refreshTrash()
    setTrashOpen(true)
  }

  const handleRestore = (entry: TrashEntry) => {
    restoreFromTrash(entry.originalFolderId)
    refreshTrash()
    reloadFolders()
    message.success(t('trash_restored', { name: entry.name }))
  }

  const handlePurge = (entry: TrashEntry) => {
    Modal.confirm({
      title: t('trash_purge_confirm_title'),
      content: t('trash_purge_confirm', { name: entry.name }),
      okText: t('confirm'),
      okButtonProps: { danger: true },
      cancelText: t('cancel'),
      onOk: () => {
        purgeTrashEntry(entry.originalFolderId)
        refreshTrash()
        message.success(t('trash_purged'))
      },
    })
  }

  const handleEmptyTrash = () => {
    Modal.confirm({
      title: t('trash_empty_confirm_title'),
      content: t('trash_empty_confirm', { count: trashEntries.length }),
      okText: t('confirm'),
      okButtonProps: { danger: true },
      cancelText: t('cancel'),
      onOk: () => {
        emptyTrash()
        refreshTrash()
        message.success(t('trash_emptied'))
      },
    })
  }

  const daysLeft = (entry: TrashEntry) =>
    Math.max(0, Math.ceil((entry.deleted_at + TRASH_RETENTION_MS - Date.now()) / (24 * 60 * 60 * 1000)))

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={2}>⚙️ {t('settings_title')}</Title>

      {/* Language Settings */}
      <Card 
        title={t('language_title')}
        style={{ marginBottom: '1.5rem' }}
      >
        <Space size="middle">
          <Button
            type={language === 'en' ? 'primary' : 'default'}
            onClick={() => handleLanguageChange('en')}
          >
            🇬🇧 {t('english')}
          </Button>
          <Button
            type={language === 'zh' ? 'primary' : 'default'}
            onClick={() => handleLanguageChange('zh')}
          >
            🇨🇳 {t('chinese')}
          </Button>
        </Space>
      </Card>

      {/* Password Protection Info */}
      <Card
        title={t('password_protection')}
        style={{ marginBottom: '1.5rem' }}
      >
        <Alert
          message={t('password_protection_title')}
          description={t('password_protection_desc')}
          type="info"
          showIcon
          style={{ marginBottom: '1rem' }}
        />
        <Text type="secondary">
          {t('password_protection_instruction')}
        </Text>
      </Card>

      {/* Appearance Settings */}
      <Card 
        title={t('display_title')}
        style={{ marginBottom: '1.5rem' }}
      >
        {/* Dark Mode */}
        <div style={{ marginBottom: '1.5rem' }}>
          <Title level={5} style={{ marginBottom: '1rem' }}>
            {t('display_mode')}
          </Title>
          <Space size="middle">
            <Button
              type={!darkMode ? 'primary' : 'default'}
              onClick={() => setDarkMode(false)}
            >
              ☀️ {t('light_mode')}
            </Button>
            <Button
              type={darkMode ? 'primary' : 'default'}
              onClick={() => setDarkMode(true)}
            >
              🌙 {t('dark_mode')}
            </Button>
          </Space>
        </div>

        <Divider />

        {/* Theme Color */}
        <div>
          <Title level={5} style={{ marginBottom: '1rem' }}>
            {t('theme_color')}
          </Title>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {colors.map(color => (
              <Button
                key={color}
                type={themeColor === color ? 'primary' : 'default'}
                onClick={() => handleColorChange(color)}
                style={{
                  width: '3rem',
                  height: '3rem',
                  padding: 0,
                  background: color,
                  borderColor: color,
                }}
              />
            ))}

            {/* 用户自定义颜色 */}
            {customColors.map(color => (
              <Button
                key={color}
                type={themeColor === color ? 'primary' : 'default'}
                onClick={() => handleColorChange(color)}
                onContextMenu={(e) => {
                  // 右键删除自定义颜色
                  e.preventDefault()
                  removeCustomColor(color)
                }}
                title={t('custom_color_remove_hint')}
                style={{
                  width: '3rem',
                  height: '3rem',
                  padding: 0,
                  background: color,
                  borderColor: color,
                }}
              />
            ))}

            {/* 取色板按钮 */}
            <ColorPicker
              open={colorPickerOpen}
              onOpenChange={(open) => (open ? setColorPickerOpen(true) : handleColorPickerClose())}
              value={themeColor}
              onChange={handleColorPicker}
              showText
              disabledAlpha
            >
              <Button
                icon={<PlusOutlined />}
                style={{ width: '3rem', height: '3rem', padding: 0 }}
                title={t('custom_color_add')}
              />
            </ColorPicker>
          </div>
          <Text type="secondary" style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.75rem' }}>
            {t('custom_color_hint')}
          </Text>
        </div>

        <Divider />

        {/* 收藏夹图标颜色自动同步 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {t('folder_icon_sync_title')}
              </Title>
              <Text type="secondary" style={{ fontSize: '0.8125rem' }}>
                {t('folder_icon_sync_desc')}
              </Text>
            </div>
            <Switch
              checked={folderIconSyncTheme}
              onChange={setFolderIconSyncTheme}
            />
          </div>
        </div>
      </Card>

      {/* Data Management */}
      <Card title={`💾 ${t('data_management')}`}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text>{t('export_import_desc')}</Text>
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              {t('export_data')}
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
              {t('import_data')}
            </Button>
            <Button icon={<LinkOutlined />} onClick={() => setImportModalOpen(true)}>
              {t('import_paste')}
            </Button>
            <Button icon={<InboxOutlined />} onClick={handleOpenTrash}>
              {t('trash_open')}
            </Button>
            <Button danger icon={<ClearOutlined />} onClick={handleClearAll}>
              {t('clear_all')}
            </Button>
          </Space>
          <Text type="secondary" style={{ fontSize: '0.75rem' }}>
            {t('clear_all_hint')}
          </Text>
          {/* 隐藏的文件选择框 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ''
            }}
          />
        </Space>
      </Card>

      {/* 导入（粘贴 JSON）弹窗 */}
      <Modal
        title={t('import_paste')}
        open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setImportText('') }}
        onOk={handleImportText}
        okText={t('confirm')}
        cancelText={t('cancel')}
        width={560}
      >
        <Input.TextArea
          rows={10}
          placeholder={t('import_paste_placeholder')}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
      </Modal>

      {/* 回收站弹窗 */}
      <Modal
        title={t('trash_open')}
        open={trashOpen}
        onCancel={() => setTrashOpen(false)}
        footer={trashEntries.length > 0 ? [
          <Button key="empty" danger onClick={handleEmptyTrash}>
            {t('trash_empty')}
          </Button>,
          <Button key="close" type="primary" onClick={() => setTrashOpen(false)}>
            {t('cancel')}
          </Button>,
        ] : undefined}
        width={560}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {t('trash_hint')}
        </Text>
        {trashEntries.length === 0 ? (
          <Empty description={t('trash_empty_desc')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={trashEntries}
            renderItem={(entry) => (
              <List.Item
                actions={[
                  <Button
                    key="restore"
                    size="small"
                    icon={<UndoOutlined />}
                    onClick={() => handleRestore(entry)}
                  >
                    {t('trash_restore')}
                  </Button>,
                  <Button
                    key="purge"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handlePurge(entry)}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={entry.name}
                  description={
                    <>
                      <DeleteOutlined style={{ marginRight: 6 }} />
                      {t('trash_deleted_at', {
                        date: new Date(entry.deleted_at).toLocaleString(),
                        days: daysLeft(entry),
                      })}
                      {entry.items.length > 0 && ` · ${entry.items.length} ${t('items')}`}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  )
}
