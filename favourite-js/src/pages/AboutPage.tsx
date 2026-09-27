import { Typography, Card, Descriptions, Collapse } from 'antd'
import { GithubOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

const { Title, Text, Paragraph, Link } = Typography

// Replace with the real repository URL if different.
const GITHUB_REPO_URL = 'https://github.com/Fu-Qian-Tiao-Yun/Favorites-Manager/tree/main'

export default function AboutPage() {
  const { t } = useTranslation()

  const helpItems = [
    { key: 'whatsnew', label: t('help_whatsnew_q'), content: t('help_whatsnew_a') },
    { key: 'folder', label: t('help_folder_q'), content: t('help_folder_a') },
    { key: 'item', label: t('help_item_q'), content: t('help_item_a') },
    { key: 'tag', label: t('help_tag_q'), content: t('help_tag_a') },
    { key: 'search', label: t('help_search_q'), content: t('help_search_a') },
    { key: 'cover', label: t('help_cover_q'), content: t('help_cover_a') },
    { key: 'mindmap', label: t('help_mindmap_q'), content: t('help_mindmap_a') },
  ]

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Title level={2}>ℹ️ {t('about_title')}</Title>

      <Card>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: '1rem',
            }}
          >
            <img
              src="/icon.png"
              alt=""
              style={{ width: '3rem', height: '3rem', display: 'block' }}
            />
            <Title level={1} style={{ fontSize: '3rem', margin: 0 }}>
              {t('app_name')}
            </Title>
          </div>
          <Text type="secondary" style={{ fontSize: '1rem' }}>
            {t('description')}
          </Text>
        </div>

        <Descriptions column={1} bordered>
          <Descriptions.Item label={t('version')}>
            v1.0.1
          </Descriptions.Item>
          <Descriptions.Item label={t('license')}>
            MIT License
          </Descriptions.Item>
          <Descriptions.Item label={t('open_source')}>
            <Link href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              <GithubOutlined /> {t('github_repo')}
            </Link>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: '2rem' }}>
          <Title level={4}>
            <QuestionCircleOutlined /> {t('help_menu')}
          </Title>
          <Collapse
            accordion
            items={helpItems.map((item) => ({
              key: item.key,
              label: item.label,
              children: <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{item.content}</Paragraph>,
            }))}
          />
        </div>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <Text type="secondary">
            {t('footer_text')}
          </Text>
        </div>
      </Card>
    </div>
  )
}
