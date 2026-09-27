import { useEffect, useMemo, useState } from 'react'
import { Modal, List, Input, Typography, Empty } from 'antd'
import { FolderOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import ItemDialog from './ItemDialog'
import { Folder } from '../core/database'
import { cleanShareText } from '../utils/share'

const { Text } = Typography

interface ShareTargetDialogProps {
  open: boolean
  /** 系统分享来的原始文本（可能含标题 + 链接） */
  sharedText: string
  folders: Folder[]
  onClose: () => void
}

/**
 * 手机端分享接收流程的第二步：
 * 1. 弹出收藏夹列表让用户选择保存位置
 * 2. 选中后打开预填好的「添加收藏项」窗口
 */
export default function ShareTargetDialog({ open, sharedText, folders, onClose }: ShareTargetDialogProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(open)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [targetFolder, setTargetFolder] = useState<Folder | null>(null)

  // 同步外部 open 状态
  useEffect(() => {
    setPickerOpen(open)
  }, [open])

  // 解析分享文本：提取 URL + 自动识别标题/分类
  const parsed = useMemo(() => cleanShareText(sharedText), [sharedText])

  const filteredFolders = useMemo(() => {
    const q = searchQuery.toLowerCase()
    if (!q) return folders
    return folders.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.tags || []).some((tag) => tag.toLowerCase().includes(q))
    )
  }, [folders, searchQuery])

  const handleSelectFolder = (folder: Folder) => {
    setTargetFolder(folder)
    setPickerOpen(false)
    setItemDialogOpen(true)
  }

  const handleItemDialogClose = () => {
    setItemDialogOpen(false)
    onClose()
  }

  return (
    <>
      {/* 第一步：选择收藏夹 */}
      <Modal
        title={t('select_folder_for_share')}
        open={pickerOpen}
        onCancel={onClose}
        footer={null}
        width={420}
        centered
      >
        <Input
          placeholder={t('folder_search_placeholder')}
          prefix={<SearchOutlined />}
          allowClear
          style={{ marginBottom: 12 }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {parsed.title && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, wordBreak: 'break-all' }}>
            {parsed.title}
          </Text>
        )}
        {filteredFolders.length === 0 ? (
          <Empty description={folders.length === 0 ? t('no_folders') : t('search_no_results')} />
        ) : (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <List
              dataSource={filteredFolders}
              renderItem={(folder) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '10px 8px' }}
                  onClick={() => handleSelectFolder(folder)}
                >
                  <List.Item.Meta
                    avatar={<FolderOutlined style={{ fontSize: 20, marginTop: 4 }} />}
                    title={folder.name}
                    description={`${folder.item_count ?? ''}`.trim() || undefined}
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>

      {/* 第二步：预填好的添加收藏项窗口 */}
      {targetFolder && (
        <ItemDialog
          open={itemDialogOpen}
          onClose={handleItemDialogClose}
          /* 由 ItemDialog 内部 onSubmit 回调接管保存 */
          onSubmit={() => {
            /* ItemsPage 等场景由父级处理；分享流程中这里只关闭窗口 */
          }}
          item={null}
          sharePreset={{
            url: parsed.url,
            title: parsed.title,
            category: parsed.category,
          }}
        />
      )}
    </>
  )
}
