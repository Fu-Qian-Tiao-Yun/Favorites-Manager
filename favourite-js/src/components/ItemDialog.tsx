import { Modal, Form, Input, Select, Button, Radio, Upload, Space, Divider, Tag, message, Tooltip } from 'antd'
import { UploadOutlined, FolderOpenOutlined, FileTextOutlined, RobotOutlined, EyeOutlined, SearchOutlined, CheckOutlined, LinkOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Item } from '../core/database'
import type { UploadProps } from 'antd'
import { autoRecognizeItem, extractCoverFromUrl } from '../utils/autoRecognize'
import { PRESET_COVERS, getDefaultPresetCoverKey, isGradientCover, isImageCover, isPresetCover, presetCoverValue, proxiedCoverUrl } from '../utils/presetCovers'
import TagSelector from './TagSelector'

interface ItemDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    itemType: 'link' | 'file'
    title: string
    url: string
    category: string
    summary: string
    coverPath?: string
    tags: string[]
  }) => void
  item?: Item | null
  onGenerateSummary?: (url: string, itemType: 'link' | 'file') => Promise<string>
  /** 手机端分享流程：打开时预填 URL/标题/分类并触发自动识别 */
  sharePreset?: { url: string; title?: string; category?: string } | null
}

export default function ItemDialog({
  open,
  onClose,
  onSubmit,
  item,
  onGenerateSummary,
  sharePreset
}: ItemDialogProps) {
  const [form] = Form.useForm()
  const { t } = useTranslation()
  const [itemType, setItemType] = useState<'link' | 'file'>('link')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverType, setCoverType] = useState<'local' | 'url' | 'preset'>('local')
  const [coverExtracting, setCoverExtracting] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  
  // Cropper state
  const [cropScale, setCropScale] = useState(1)
  const [cropPosition, setCropPosition] = useState({ x: 50, y: 50 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 })
  const [isCropping, setIsCropping] = useState(false)
  // The drag container (cover preview area). The move listeners live on
  // `window`, so e.currentTarget there is the window - capture the element
  // itself in a ref when the drag starts instead.
  const cropContainerRef = useRef<HTMLDivElement | null>(null)
   
  // Helper function to convert File to base64 string
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = (err) => reject(err)
    })
  }
  
  // Cropper event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    cropContainerRef.current = e.currentTarget
    setIsDragging(true)
    setLastPosition({
      x: e.clientX,
      y: e.clientY
    })
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      cropContainerRef.current = e.currentTarget
      setIsDragging(true)
      setLastPosition({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      })
    }
  }

  // We need to add mouse move and up listeners to the window
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      
      const dx = e.clientX - lastPosition.x
      const dy = e.clientY - lastPosition.y
      
      // Calculate percentage movement relative to the container captured on drag start
      const container = cropContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      
      const moveX = (dx / rect.width) * 100
      const moveY = (dy / rect.height) * 100
      
      setCropPosition(prev => ({
        x: Math.max(0, Math.min(100, prev.x + moveX)),
        y: Math.max(0, Math.min(100, prev.y + moveY))
      }))
      
      setLastPosition({
        x: e.clientX,
        y: e.clientY
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return
      
      const dx = e.touches[0].clientX - lastPosition.x
      const dy = e.touches[0].clientY - lastPosition.y
      
      // Calculate percentage movement relative to the container captured on drag start
      const container = cropContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      
      const moveX = (dx / rect.width) * 100
      const moveY = (dy / rect.height) * 100
      
      setCropPosition(prev => ({
        x: Math.max(0, Math.min(100, prev.x + moveX)),
        y: Math.max(0, Math.min(100, prev.y + moveY))
      }))
      
      setLastPosition({
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      })
    }

    const handleTouchEnd = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isDragging, lastPosition])

  // Update cover preview when crop settings change
  useEffect(() => {
    if (coverPreview) {
      setIsCropping(true)
    }
  }, [coverPreview, cropScale, cropPosition])
  
  const categories = [
    'Software', 'Programming', 'Design', 'Video', 
    'Music', 'Document', 'Image', 'Social', 'News',
    'Shopping', 'Search', 'Education', 'Game', 'AI',
    'Tool', 'Reading', 'Other'
  ]

  useEffect(() => {
    if (open) {
      // Delay to ensure Form is mounted
      setTimeout(() => {
        if (item) {
          setItemType(item.item_type)
          setTags(item.tags || [])
          form.setFieldsValue({
            itemType: item.item_type,
            title: item.title || '',
            url: item.url || '',
            category: item.category || '',
            summary: item.summary || '',
            cover: item.cover_path || ''
          })
          // Show the right cover tab and preview for the saved cover
          const savedCover = item.cover_path || ''
          if (isPresetCover(savedCover)) setCoverType('preset')
          else if (savedCover.startsWith('data:')) setCoverType('local')
          else if (savedCover) setCoverType('url')
          else setCoverType('local')
          setCoverPreview(isImageCover(savedCover) ? savedCover : null)
          setCoverFile(null)
        } else if (sharePreset) {
          // 手机端分享预填：填入 URL/标题，触发自动识别（标题/分类/封面）
          setItemType('link')
          setTags([])
          form.resetFields()
          form.setFieldsValue({
            itemType: 'link',
            url: sharePreset.url,
            title: sharePreset.title || '',
            category: sharePreset.category || ''
          })
          setCoverType('local')
          setCoverPreview(null)
          setCoverFile(null)
          setTimeout(() => { handleAutoRecognizeRef.current() }, 50)
        } else {
          setItemType('link')
          setTags([])
          form.resetFields()
          form.setFieldsValue({ cover: '' })
          setCoverType('local')
          setCoverPreview(null)
          setCoverFile(null)
        }
      }, 100)
    }
  }, [open, item, sharePreset])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      onSubmit({
        itemType: values.itemType,
        title: values.title,
        url: values.url,
        category: values.category || '',
        summary: values.summary || '',
        coverPath: values.cover || '',
        tags
      })
      onClose()
    } catch (err) {
      // Validation failed
    }
  }

  // 让 sharePreset 的 effect 在 handleAutoRecognize 定义前也能调用它
  const handleAutoRecognizeRef = useRef<() => void>(() => {})

  const handleAutoRecognize = async () => {
    const url = form.getFieldValue('url')
    if (!url) {
      message.warning(t('url_required'))
      return
    }

    setRecognizing(true)
    try {
      const { title, category, summary, urlOrPath } = await autoRecognizeItem(url, itemType)
      // Update form fields with recognized data
      form.setFieldsValue({
        title: title || '',
        url: urlOrPath || url,
        category: category || '',
        summary: summary || ''
      })
      message.success(t('auto_recognize_success'))

      // Auto-set cover to preset cover based on recognized category
      // Map recognized category to preset cover key
      const categoryToPresetKey: Record<string, string> = {
        'Video': 'video',
        'Image': 'image',
        'Music': 'music',
        'Document': 'document',
        'Software': 'software',
        'Programming': 'programming',
        'Design': 'design',
        'Social': 'social',
        'News': 'news',
        'Shopping': 'shopping',
        'Search': 'search',
        'Education': 'education',
        'Game': 'game',
        'AI': 'ai',
        'Tool': 'tool',
        'Reading': 'reading',
        'Other': 'other',
      }
      const presetKey = categoryToPresetKey[category] || 'other'
      const presetCover = presetCoverValue(presetKey)
      form.setFieldsValue({ cover: presetCover })
      setCoverPreview(null)
      setCoverFile(null)
      setCoverType('preset')

      // For links, also try to extract the cover from the page metadata - best effort,
      // never blocks the recognition result. If successful, it overrides the preset.
      if (itemType === 'link') {
        try {
          const cover = await extractCoverFromUrl(url)
          if (cover) {
            form.setFieldsValue({ cover })
            setCoverPreview(cover)
            setCoverFile(null)
            setCoverType('url')
            message.success(t('cover_extracted'))
          }
        } catch (err) {
          console.warn('Auto cover extraction failed:', err)
        }
      }
    } catch (err) {
      console.error('Auto-recognition failed:', err)
      message.error(t('auto_recognize_failed'))
    } finally {
      setRecognizing(false)
    }
  }

  // 把实际函数挂到 ref 上，供 sharePreset effect（定义在其之前）调用
  handleAutoRecognizeRef.current = () => { handleAutoRecognize() }

  // Extract the cover image from the item's URL via page metadata (og:image).
  // This is the only network path - everything else stays local.
  const handleExtractCover = async () => {
    const url = form.getFieldValue('url')
    if (!url) {
      message.warning(t('url_required'))
      return
    }

    setCoverExtracting(true)
    try {
      const cover = await extractCoverFromUrl(url)
      form.setFieldsValue({ cover })
      setCoverPreview(cover)
      setCoverFile(null)
      setCoverType('url')
      message.success(t('cover_extracted'))
    } catch (err) {
      console.error('Cover extraction failed:', err)
      // 后端返回的具体错误信息优先展示，便于用户/开发者定位问题层次
      const backendMsg = err instanceof Error && err.message && !err.message.startsWith('backend') ? err.message : undefined
      message.warning(backendMsg || t('cover_extract_failed'))
    } finally {
      setCoverExtracting(false)
    }
  }

  const handleGenerateSummary = async () => {
    const url = form.getFieldValue('url')
    if (!url) {
      message.warning(t('url_required'))
      return
    }

    if (!onGenerateSummary) {
      message.info(t('generate_summary_coming_soon'))
      return
    }

    setSummaryLoading(true)
    try {
      const summary = await onGenerateSummary(url, itemType)
      form.setFieldsValue({ summary })
      message.success(t('summary_generated'))
    } catch (err) {
      message.error(t('summary_generate_failed'))
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      form.setFieldsValue({
        url: file.name,
        title: file.name
      })
    }
  }

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      form.setFieldsValue({
        url: file.name,
        title: file.name
      })
      return false
    },
    maxCount: 1,
  }

  const coverUploadProps: UploadProps = {
    beforeUpload: async (file) => {
      try {
        const base64 = await fileToBase64(file)
        setCoverPreview(base64)
        setCoverFile(file)
        // Also update the form field
        await form.setFieldsValue({ cover: base64 })
      } catch (err) {
        console.error('Failed to read cover file:', err)
        message.error(t('cover_upload_failed'))
      }
      return false
    },
    maxCount: 1,
  }

  const currentSummary = form.getFieldValue('summary') || ''
  // Reactively watch the `cover` field so the UI (preset highlight, URL input)
  // updates when it changes - plain getFieldValue() during render would not.
  const watchedCover = (Form.useWatch('cover', form) || '') as string
  // The cover value shown in the image-URL input (presets/gradients/data URLs excluded)
  const coverFormValue = watchedCover
  const coverUrlValue = coverFormValue
    && !isPresetCover(coverFormValue)
    && !isGradientCover(coverFormValue)
    && !coverFormValue.startsWith('data:')
    ? coverFormValue
    : ''

  return (
    <Modal
      title={item ? t('edit_item') : t('add_item')}
      open={open}
      onCancel={onClose}
      width={600}
      okText={t('save')}
      cancelText={t('cancel')}
      onOk={handleSubmit}
    >
      <Form form={form} layout="vertical" initialValues={{ itemType: 'link', cover: '' }}>
        {/* Hidden field: registers `cover` so it is included in validateFields() results */}
        <Form.Item name="cover" hidden>
          <Input />
        </Form.Item>

        <Form.Item
          name="itemType"
          label={t('item_type')}
        >
          <Radio.Group onChange={(e) => setItemType(e.target.value)}>
            <Radio.Button value="link"><LinkOutlined /> {t('type_link')}</Radio.Button>
            <Radio.Button value="file"><FolderOpenOutlined /> {t('type_file')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="url"
          label={t('item_url')}
          rules={[{ required: true, message: t('url_required') }]}
        >
          {itemType === 'link' ? (
            <Input 
              placeholder={t('url_placeholder')}
            />
          ) : (
            <Space.Compact style={{ width: '100%' }}>
              <Input 
                placeholder={t('file_path_placeholder')}
              />
              <Upload {...uploadProps}>
                <Button icon={<FolderOpenOutlined />}>
                  {t('select_file')}
                </Button>
              </Upload>
            </Space.Compact>
          )}
        </Form.Item>

        {itemType === 'link' && (
          <div style={{ marginTop: -8, marginBottom: '1rem', fontSize: '0.75rem', color: '#999' }}>
            {t('cover_extract_hint')}
          </div>
        )}

        <Form.Item name="title" label={t('item_title')}>
          <Input placeholder={t('item_title_placeholder')} />
        </Form.Item>

        <Form.Item name="category" label={t('item_category')}>
          <Select
            placeholder={t('select_category')}
            allowClear
            options={categories.map(cat => ({
              label: t(`category_${cat.toLowerCase()}`) || cat,
              value: cat
            }))}
          />
        </Form.Item>

        <Form.Item label={t('tags')} style={{ marginBottom: 0 }}>
          <TagSelector value={tags} onChange={setTags} />
        </Form.Item>

        <Divider>
          <FileTextOutlined /> {t('summary')}
          {currentSummary && (
            <Tag color="green" style={{ marginLeft: '0.5rem' }}>
              {t('has_summary')}
            </Tag>
          )}
        </Divider>

        <Form.Item name="summary" label={t('summary_content')}>
          <Input.TextArea 
            rows={5}
            placeholder={t('summary_placeholder')}
            showCount
            maxLength={2000}
          />
        </Form.Item>

        <Form.Item label={t('item_cover')}>
          <Radio.Group
            value={coverType}
            onChange={(e) => {
              const next = e.target.value as 'local' | 'url' | 'preset'
              setCoverType(next)
              const current = form.getFieldValue('cover')
              if (next === 'local') {
                // Preset/gradient placeholders don't belong on the image tab; keep image covers
                if (isPresetCover(current) || isGradientCover(current)) {
                  form.setFieldsValue({ cover: '' })
                  setCoverPreview(null)
                  setCoverFile(null)
                }
              } else if (next === 'url') {
                // Keep an http(s) image URL; clear presets and local data-URL uploads
                if (isPresetCover(current) || isGradientCover(current)
                    || (typeof current === 'string' && current.startsWith('data:'))) {
                  form.setFieldsValue({ cover: '' })
                  setCoverPreview(null)
                  setCoverFile(null)
                }
              } else {
                // Keep an existing preset, otherwise default to one for this item type
                if (!isPresetCover(current)) {
                  form.setFieldsValue({ cover: presetCoverValue(getDefaultPresetCoverKey(itemType)) })
                  setCoverPreview(null)
                  setCoverFile(null)
                }
              }
            }}
          >
            <Radio.Button value="local">{t('local_image')}</Radio.Button>
            <Radio.Button value="url">{t('cover_by_url')}</Radio.Button>
            <Radio.Button value="preset">{t('preset_cover')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {/* Conditional cover selection */}
        {coverType === 'local' ? (
          <Form.Item style={{ marginTop: '1rem' }}>
            <Space.Compact style={{ width: '100%' }}>
              <Upload {...coverUploadProps}>
                <Button icon={<FileTextOutlined />}>
                  {t('select_cover')}
                </Button>
              </Upload>
              <div style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#999' }}>
                {t('cover_hint')}
              </div>
            </Space.Compact>
          </Form.Item>
        ) : coverType === 'url' ? (
          <Form.Item style={{ marginTop: '1rem' }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder={t('cover_url_placeholder')}
                value={coverUrlValue}
                onChange={(e) => {
                  const v = e.target.value
                  form.setFieldsValue({ cover: v })
                  setCoverPreview(v.trim() ? v.trim() : null)
                  setCoverFile(null)
                }}
              />
              <Tooltip title={t('extract_cover_hint')}>
                <Button
                  icon={<SearchOutlined />}
                  loading={coverExtracting}
                  onClick={handleExtractCover}
                >
                  {t('extract_cover')}
                </Button>
              </Tooltip>
            </Space.Compact>
          </Form.Item>
        ) : (
          <Form.Item style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {PRESET_COVERS.map((cover) => {
                const value = presetCoverValue(cover.key)
                const selected = watchedCover === value
                const Icon = cover.icon
                return (
                  <div
                    key={cover.key}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', width: '3.75rem', cursor: 'pointer' }}
                    onClick={() => {
                      form.setFieldsValue({ cover: value })
                      setCoverPreview(null)
                      setCoverFile(null)
                    }}
                  >
                    <div
                      style={{
                        width: '3.75rem',
                        height: '3.75rem',
                        borderRadius: 8,
                        background: cover.color,
                        border: selected ? '2px solid #1890ff' : '2px solid transparent',
                        boxShadow: selected ? '0 0 0 2px #fff, 0 0 0 4px #1890ff' : '0 1px 3px rgba(0,0,0,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <Icon style={{ fontSize: '1.5rem', color: '#fff' }} />
                      {selected && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '0.25rem',
                            right: '0.25rem',
                            width: '1rem',
                            height: '1rem',
                            borderRadius: '50%',
                            background: '#1890ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <CheckOutlined style={{ color: '#fff', fontSize: '0.625rem' }} />
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        color: '#888',
                        textAlign: 'center',
                        maxWidth: '3.75rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t(cover.i18nKey)}
                    </span>
                  </div>
                )
              })}
            </div>
          </Form.Item>
        )}

        {/* Cover Preview with Crop Controls (image covers only) */}
        {coverPreview && isImageCover(coverPreview) && (
          <>
            <Form.Item style={{ marginTop: '1rem' }}>
              <div 
                style={{ 
                  position: 'relative',
                  width: '100%', 
                  height: '11.25rem', 
                  borderRadius: 8, 
                  border: '1px dashed #d9d9d9',
                  overflow: 'hidden',
                  touchAction: 'none'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
              >
                <div 
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: `url(${proxiedCoverUrl(coverPreview)})`,
                    backgroundSize: `${cropScale * 100}%`,
                    backgroundPosition: `${cropPosition.x}% ${cropPosition.y}%`,
                    backgroundRepeat: 'no-repeat',
                    transformOrigin: 'top left',
                    transition: 'transform 0.1s ease-out',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}
                />
                
                {/* Crop overlay */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{
                    color: 'white',
                    fontSize: '1rem',
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '0.5rem 1rem',
                    borderRadius: 4
                  }}>
                    {isCropping ? t('adjust_cover') : t('click_and_drag_to_move')}
                  </div>
                </div>
              </div>
              
              {/* Zoom controls */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                gap: '0.5rem',
                marginTop: '0.5rem'
              }}>
                <Button 
                  size="small"
                  onClick={() => setCropScale(Math.max(0.5, cropScale - 0.1))}
                >
                  <SearchOutlined /> {t('zoom_out')}
                </Button>
                <span style={{ fontSize: '0.75rem', color: '#666' }}>
                  {Math.round(cropScale * 100)}%
                </span>
                <Button 
                  size="small"
                  onClick={() => setCropScale(Math.min(3, cropScale + 0.1))}
                >
                  {t('zoom_in')} <SearchOutlined />
                </Button>
              </div>
              
              {/* Reset button */}
              <div style={{ 
                textAlign: 'center', 
                marginTop: '0.25rem'
              }}>
                <Button 
                  size="small"
                  type="text"
                  onClick={() => {
                    setCropScale(1);
                    setCropPosition({ x: 50, y: 50 });
                  }}
                >
                  {t('reset_view')}
                </Button>
              </div>
            </Form.Item>
          </>
        )}

        <Space>
          <Tooltip title={t('auto_recognize_hint')}>
            <Button
              icon={<SearchOutlined />}
              onClick={handleAutoRecognize}
              loading={recognizing}
              disabled={itemType !== 'link'}
            >
              {t('auto_recognize')}
            </Button>
          </Tooltip>
          <Tooltip title={t('ai_coming_soon')}>
            <Button
              icon={<RobotOutlined />}
              onClick={handleGenerateSummary}
              loading={summaryLoading}
              disabled={true}
            >
              {t('generate_summary')}
            </Button>
          </Tooltip>
          {currentSummary && (
            <Button
              icon={<EyeOutlined />}
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? t('hide_preview') : t('show_preview')}
            </Button>
          )}
        </Space>

        {showPreview && currentSummary && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#f5f5f5',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              fontSize: '0.875rem',
              lineHeight: 1.8,
            }}
          >
            {currentSummary}
          </div>
        )}
      </Form>
    </Modal>
  )
}