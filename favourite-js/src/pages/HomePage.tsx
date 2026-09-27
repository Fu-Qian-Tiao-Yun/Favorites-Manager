import { Layout as AntLayout, Typography, Button, Input, Grid, Spin, Empty, Tooltip, Space, Modal, ColorPicker, message } from 'antd'
import { 
  PlusOutlined, 
  SearchOutlined, 
  DeleteOutlined,
  FolderAddOutlined,
  EditOutlined,
  ReloadOutlined,
  CheckSquareOutlined,
  BgColorsOutlined,
  TagsOutlined,
  CloseOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDBStore } from '../stores/dbStore'
import { useUIStore } from '../stores/uiStore'
import FolderCard from '../components/FolderCard'
import FolderDialog from '../components/FolderDialog'
import ItemMiniCard from '../components/ItemMiniCard'
import TagSelector from '../components/TagSelector'
import { Folder, Item, getRecentItems, getHistoryPool, incrementItemClicks, deleteFolder, setFoldersColor, addTagsToFolders } from '../core/database'
import { isItemUnlocked } from '../utils/password'

const { Content } = AntLayout
const { Title, Text } = Typography
const { useBreakpoint } = Grid

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const { darkMode, language } = useUIStore()
  
  const { 
    folders, 
    loading, 
    error, 
    loadFolders, 
    createFolder, 
    renameFolder, 
    removeFolder 
  } = useDBStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)
  // Mobile: the search bar collapses to an icon that opens an inline input
  const [searchOpen, setSearchOpen] = useState(false)
  // ── 多选模式 ──────────────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  // 批量改色弹窗
  const [batchColorOpen, setBatchColorOpen] = useState(false)
  const [batchColorDraft, setBatchColorDraft] = useState('#0078d7')
  // 批量标签弹窗
  const [batchTagsOpen, setBatchTagsOpen] = useState(false)
  const [batchTags, setBatchTags] = useState<string[]>([])

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => !prev)
    setSelectedIds([])
  }

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  // 批量删除（确认后逐个移入回收站）
  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return
    Modal.confirm({
      title: t('batch_delete_title'),
      content: t('batch_delete_folders_confirm', { count: selectedIds.length }),
      okText: t('confirm'),
      okButtonProps: { danger: true },
      cancelText: t('cancel'),
      onOk: async () => {
        for (const id of selectedIds) {
          await deleteFolder(id)
        }
        setSelectedIds([])
        setSelectionMode(false)
        loadFolders()
        message.success(t('batch_delete_done', { count: selectedIds.length }))
      },
    })
  }

  // 批量改色
  const handleBatchColor = async () => {
    await setFoldersColor(selectedIds, batchColorDraft)
    setBatchColorOpen(false)
    loadFolders()
    message.success(t('batch_color_done', { count: selectedIds.length }))
  }

  // 批量添加标签
  const handleBatchTags = async () => {
    if (batchTags.length === 0) return
    await addTagsToFolders(selectedIds, batchTags)
    setBatchTagsOpen(false)
    setBatchTags([])
    loadFolders()
    message.success(t('batch_tags_done', { count: selectedIds.length }))
  }
  // Recent / history rows
  const [recentItems, setRecentItems] = useState<Item[]>([])
  const [historyItems, setHistoryItems] = useState<Item[]>([])
  const [historyPoolSize, setHistoryPoolSize] = useState(0)

  const HISTORY_SHOW = 10
  const isMobile = screens.md === false

  // History row: sample from the oldest + least-clicked candidates; the
  // refresh button re-samples when there are more candidates than fit.
  const refreshHistory = async () => {
    const pool = await getHistoryPool()
    setHistoryPoolSize(pool.length)
    const candidates = pool.slice(0, Math.min(pool.length, 30))
    if (candidates.length <= HISTORY_SHOW) {
      setHistoryItems(candidates)
    } else {
      const shuffled = [...candidates].sort(() => Math.random() - 0.5)
      setHistoryItems(shuffled.slice(0, HISTORY_SHOW))
    }
  }

  // Load the "recent" and "history" rows (across all folders)
  const loadHomeSections = async () => {
    setRecentItems(await getRecentItems(10))
    await refreshHistory()
  }

  // An item (or its parent folder) may be password protected
  const isMiniLocked = (item: Item): boolean => {
    const folder = folders.find(f => f.id === item.folder_id)
    return (!!folder?.password_hash && !isItemUnlocked('folder', item.folder_id))
      || (!!item.password_hash && !isItemUnlocked('item', item.id))
  }

  // Open a recent/history item (or jump to its folder when locked)
  const handleMiniOpen = async (item: Item) => {
    if (isMiniLocked(item)) {
      navigate(`/folder/${item.folder_id}`)
      return
    }
    await incrementItemClicks(item.id)
    if (item.item_type === 'link' && item.url) {
      window.open(item.url, '_blank')
    } else if (item.item_type === 'file' && item.url) {
      const link = document.createElement('a')
      link.href = item.url
      link.download = item.url.split(/[\\/]/).pop() || 'file'
      link.click()
    }
    // Keep the local rows in sync (click counts changed)
    const bump = (list: Item[]) => list.map(i => i.id === item.id ? { ...i, click_count: (i.click_count || 0) + 1 } : i)
    setRecentItems(prev => bump(prev))
    setHistoryItems(prev => bump(prev))
  }

  useEffect(() => {
    loadFolders()
    loadHomeSections()
  }, [loadFolders])

  const filteredFolders = folders.filter(folder => {
    const lowerQuery = searchQuery.toLowerCase()
    return folder.name.toLowerCase().includes(lowerQuery) ||
      (folder.tags || []).some(tag => tag.toLowerCase().includes(lowerQuery))
  })

  const handleAddFolder = () => {
    setEditingFolder(null)
    setDialogOpen(true)
  }

  const handleEditFolder = (folder: Folder) => {
    setEditingFolder(folder)
    setDialogOpen(true)
  }

  const handleSubmit = async (name: string, tags: string[]) => {
    try {
      if (editingFolder) {
        await renameFolder(editingFolder.id, name, tags)
      } else {
        await createFolder(name, tags)
      }
    } catch (err) {
      console.error('Failed to submit folder:', err)
    }
  }

  const handleDeleteFolder = async (folder: Folder) => {
    if (window.confirm(t('delete_folder_confirm'))) {
      await removeFolder(folder.id)
    }
  }

  const getGridCols = () => {
    if (screens.xxl) return 6
    if (screens.xl) return 5
    if (screens.lg) return 4
    if (screens.md) return 3
    if (screens.sm) return 2
    // Phones: two folders side by side
    return 2
  }

  return (
    <div>
      {/* Header Section: sticks below the app header so the search bar and
          add-folder button stay visible while the folder grid scrolls */}
      <div 
        style={{ 
          position: 'sticky',
          top: 'var(--app-header-h)',
          zIndex: 10,
          background: darkMode ? '#1a1a1a' : '#f5f5f5',
          padding: 'var(--page-pad) 0',
          marginBottom: 8,
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--page-gap)'
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            📁 {t('Folders')}
          </Title>
          <Text type="secondary">
            {folders.length} {t('items')}
          </Text>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 多选模式：搜索框左边显示批量操作按钮 */}
          {selectionMode ? (
            <Space size={8} wrap>
              <Tooltip title={t('batch_delete')}>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={selectedIds.length === 0}
                  onClick={handleBatchDelete}
                />
              </Tooltip>
              <Tooltip title={t('batch_color')}>
                <Button
                  icon={<BgColorsOutlined />}
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    setBatchColorDraft('#0078d7')
                    setBatchColorOpen(true)
                  }}
                />
              </Tooltip>
              <Tooltip title={t('batch_tags')}>
                <Button
                  icon={<TagsOutlined />}
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    setBatchTags([])
                    setBatchTagsOpen(true)
                  }}
                />
              </Tooltip>
              <Button
                icon={<CloseOutlined />}
                onClick={toggleSelectionMode}
              >
                {t('batch_exit')}
              </Button>
              <Text type="secondary" style={{ fontSize: '0.8125rem' }}>
                {t('batch_selected_count', { count: selectedIds.length })}
              </Text>
            </Space>
          ) : (
            <>
              {isMobile ? (
                <Tooltip title={t('folder_search_placeholder')}>
                  <Button
                    icon={<SearchOutlined />}
                    onClick={() => setSearchOpen(true)}
                  />
                </Tooltip>
              ) : (
                <Input
                  placeholder={t('folder_search_placeholder')}
                  prefix={<SearchOutlined />}
                  allowClear
                  style={{ width: '15rem' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              )}
              <Tooltip title={t('batch_select_mode')}>
                <Button
                  icon={<CheckSquareOutlined />}
                  onClick={toggleSelectionMode}
                />
              </Tooltip>
            </>
          )}

          {!selectionMode && (
            <Tooltip title={t('add_folder')}>
              <Button
                type="primary"
                icon={language === 'en' ? undefined : <PlusOutlined />}
                onClick={handleAddFolder}
              >
                {!isMobile && t('add_folder_btn')}
              </Button>
            </Tooltip>
          )}
        </div>

        {/* Mobile: tapping the search icon reveals an inline search box */}
        {isMobile && searchOpen && (
          <div style={{ width: '100%' }}>
            <Input
              autoFocus
              placeholder={t('folder_search_placeholder')}
              prefix={<SearchOutlined />}
              allowClear
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => setSearchOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Recently added / history rows (horizontal scroll stays inside these rows) */}
      {(recentItems.length > 0 || historyItems.length > 0) && (
        <div style={{ marginBottom: '1rem' }}>
          {recentItems.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Title level={5} style={{ margin: 0 }}>🕘 {t('recent_favorites')}</Title>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                {recentItems.map(item => (
                  <ItemMiniCard key={item.id} item={item} locked={isMiniLocked(item)} onOpen={handleMiniOpen} />
                ))}
              </div>
            </div>
          )}

          {historyItems.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Title level={5} style={{ margin: 0 }}>🏛️ {t('history_museum')}</Title>
                {historyPoolSize > historyItems.length && (
                  <Tooltip title={t('refresh')}>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={refreshHistory}
                    />
                  </Tooltip>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                {historyItems.map(item => (
                  <ItemMiniCard key={item.id} item={item} locked={isMiniLocked(item)} onOpen={handleMiniOpen} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={{ color: '#ff4d4f', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Spin size="large" />
        </div>
      )}

      {/* Empty State */}
      {!loading && folders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '5rem' }}>
          <Empty
            description={t('no_folders')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Tooltip title={t('add_folder')}>
              <Button
                type="primary"
                icon={language === 'en' ? undefined : <FolderAddOutlined />}
                onClick={handleAddFolder}
              >
                {t('add_folder_btn')}
              </Button>
            </Tooltip>
          </Empty>
        </div>
      )}

      {/* Folder Grid */}
      {!loading && filteredFolders.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${getGridCols()}, 1fr)`,
            gap: 'var(--page-gap)'
          }}
        >
          {filteredFolders.map(folder => (
            <div key={folder.id}>
              <FolderCard 
                folder={folder}
                onPasswordChange={() => loadFolders()}
                searchQuery={searchQuery}
                selectionMode={selectionMode}
                selected={selectedIds.includes(folder.id)}
                onToggleSelect={handleToggleSelect}
              />
              
              {/* Context Actions */}
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  gap: 8, 
                  marginTop: 8 
                }}
              >
                <Tooltip title={t('edit')}>
                  <Button 
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEditFolder(folder)}
                  />
                </Tooltip>
                <Tooltip title={t('delete')}>
                  <Button 
                    size="small" 
                    danger 
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteFolder(folder)}
                  />
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Search Results */}
      {!loading && folders.length > 0 && filteredFolders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <Empty description={t('search_no_results')} />
        </div>
      )}

      {/* Folder Dialog */}
      <FolderDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setEditingFolder(null)
        }}
        onSubmit={handleSubmit}
        initialName={editingFolder?.name}
        initialTags={editingFolder?.tags || []}
      />

      {/* 批量改色弹窗 */}
      <Modal
        title={t('batch_color_title', { count: selectedIds.length })}
        open={batchColorOpen}
        onCancel={() => setBatchColorOpen(false)}
        onOk={handleBatchColor}
        okText={t('confirm')}
        cancelText={t('cancel')}
        width={380}
        centered
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: '4rem',
              height: '4rem',
              borderRadius: 12,
              background: `linear-gradient(135deg, ${batchColorDraft}20, ${batchColorDraft}40)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FolderAddOutlined style={{ fontSize: '2rem', color: batchColorDraft }} />
          </div>
          <ColorPicker
            value={batchColorDraft}
            onChange={(value) => {
              const hex = typeof value === 'string' ? value : value?.toHexString?.()
              if (hex) setBatchColorDraft(hex)
            }}
            disabledAlpha
            showText
          />
        </div>
      </Modal>

      {/* 批量标签弹窗 */}
      <Modal
        title={t('batch_tags_title', { count: selectedIds.length })}
        open={batchTagsOpen}
        onCancel={() => { setBatchTagsOpen(false); setBatchTags([]) }}
        onOk={handleBatchTags}
        okText={t('confirm')}
        cancelText={t('cancel')}
        width={480}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">{t('batch_tags_hint')}</Text>
        </div>
        <TagSelector value={batchTags} onChange={setBatchTags} />
      </Modal>
    </div>
  )
}
