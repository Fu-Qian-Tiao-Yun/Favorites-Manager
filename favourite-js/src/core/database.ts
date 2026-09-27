// Persistent storage layer.
// On PC (Electron): writes a JSON file to AppData/Local/Favourites-Manager.
// On Android / Web: uses the built-in storage.
import { storage } from '../utils/storage'

export interface Folder {
  id: number
  name: string
  created_at: string
  item_count?: number
  password_hash?: string | null
  password_salt?: string | null
  tags?: string[]
  /** 收藏夹卡片图标的自定义颜色；空 = 同步主题色 */
  color?: string | null
}

export interface Item {
  id: number
  folder_id: number
  item_type: 'link' | 'file'
  title: string | null
  url: string | null
  category: string | null
  cover_path: string | null
  summary: string | null
  created_at: string
  password_hash?: string | null
  password_salt?: string | null
  tags?: string[]
  click_count?: number
}

const STORAGE_KEYS = {
  FOLDERS: 'favourite_folders',
  ITEMS: 'favourite_items',
  TAGS: 'favourite_tags',
  NEXT_FOLDER_ID: 'favourite_next_folder_id',
  NEXT_ITEM_ID: 'favourite_next_item_id',
  /** 回收站：软删除的收藏夹（含 items），30 天后彻底清除 */
  TRASH: 'favourite_trash'
}

/** 回收站保留期（毫秒）：30 天 */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export interface TrashEntry {
  /** 原收藏夹 id（恢复时尽量复用） */
  originalFolderId: number
  name: string
  created_at: string
  tags?: string[]
  color?: string | null
  password_hash?: string | null
  password_salt?: string | null
  items: Item[]
  /** 删除时间 */
  deleted_at: number
}

// Initialize storage with defaults if empty
function initStorage(): void {
  if (!storage.getItem(STORAGE_KEYS.FOLDERS)) {
    storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify([]))
  }
  if (!storage.getItem(STORAGE_KEYS.ITEMS)) {
    storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify([]))
  }
  if (!storage.getItem(STORAGE_KEYS.NEXT_FOLDER_ID)) {
    storage.setItem(STORAGE_KEYS.NEXT_FOLDER_ID, '1')
  }
  if (!storage.getItem(STORAGE_KEYS.NEXT_ITEM_ID)) {
    storage.setItem(STORAGE_KEYS.NEXT_ITEM_ID, '1')
  }
  if (!storage.getItem(STORAGE_KEYS.TAGS)) {
    storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify([]))
  }
}

// Tag pool operations (global, shared by folders and items)
export async function getAllTags(): Promise<string[]> {
  initStorage()
  return JSON.parse(storage.getItem(STORAGE_KEYS.TAGS) || '[]')
}

export async function createTag(name: string): Promise<void> {
  initStorage()
  const trimmed = name.trim()
  if (!trimmed) return
  const tags: string[] = JSON.parse(storage.getItem(STORAGE_KEYS.TAGS) || '[]')
  if (!tags.includes(trimmed)) {
    tags.push(trimmed)
    storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(tags))
  }
}

/** Removes a tag everywhere: from the pool, all folders and all items */
export async function deleteTag(name: string): Promise<void> {
  initStorage()
  const tags: string[] = JSON.parse(storage.getItem(STORAGE_KEYS.TAGS) || '[]')
  storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(tags.filter(t => t !== name)))

  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  let changed = false
  for (const folder of folders) {
    if (folder.tags?.includes(name)) {
      folder.tags = folder.tags.filter(t => t !== name)
      changed = true
    }
  }
  for (const item of items) {
    if (item.tags?.includes(name)) {
      item.tags = item.tags.filter(t => t !== name)
      changed = true
    }
  }
  if (changed) {
    storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
    storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
  }
}

export async function initDatabase(): Promise<void> {
  initStorage()
  console.log('[DB] Storage initialized (using storage)')
}

// Folder operations
export async function addFolder(name: string, tags: string[] = []): Promise<number> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  let nextId = parseInt(storage.getItem(STORAGE_KEYS.NEXT_FOLDER_ID) || '1')
  
  const newFolder: Folder = {
    id: nextId,
    name,
    created_at: new Date().toISOString(),
    item_count: 0,
    tags
  }
  
  folders.push(newFolder)
  storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
  storage.setItem(STORAGE_KEYS.NEXT_FOLDER_ID, String(nextId + 1))
  
  return newFolder.id
}

export async function getFolders(): Promise<Folder[]> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  // Add item count to each folder
  const foldersWithCount = folders.map(folder => ({
    ...folder,
    item_count: items.filter(item => item.folder_id === folder.id).length
  }))
  
  // Sort by created_at descending
  return foldersWithCount.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export async function renameFolder(id: number, name: string, tags?: string[]): Promise<void> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  
  const index = folders.findIndex(f => f.id === id)
  if (index !== -1) {
    folders[index].name = name
    if (tags !== undefined) folders[index].tags = tags
    storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
  }
}

/** 设置收藏夹卡片图标颜色（null = 恢复自动同步主题色） */
export async function setFolderColor(id: number, color: string | null): Promise<void> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  const index = folders.findIndex(f => f.id === id)
  if (index !== -1) {
    folders[index].color = color
    storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
  }
}

/** 批量设置收藏夹颜色 */
export async function setFoldersColor(ids: number[], color: string | null): Promise<void> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  for (const folder of folders) {
    if (ids.includes(folder.id)) folder.color = color
  }
  storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
}

/** 批量给收藏夹追加标签（合并去重，不覆盖已有标签） */
export async function addTagsToFolders(ids: number[], newTags: string[]): Promise<void> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  let changed = false
  for (const folder of folders) {
    if (!ids.includes(folder.id)) continue
    const merged = [...new Set([...(folder.tags || []), ...newTags])]
    if (merged.length !== (folder.tags || []).length) {
      folder.tags = merged
      changed = true
    }
  }
  if (changed) storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
}

export async function deleteFolder(id: number): Promise<void> {
  initStorage()
  let folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  let items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  // 移入回收站（30 天内可恢复）
  const folder = folders.find(f => f.id === id)
  if (folder) {
    const trash: TrashEntry[] = JSON.parse(storage.getItem(STORAGE_KEYS.TRASH) || '[]')
    trash.push({
      originalFolderId: folder.id,
      name: folder.name,
      created_at: folder.created_at,
      tags: folder.tags,
      color: folder.color ?? null,
      password_hash: folder.password_hash ?? null,
      password_salt: folder.password_salt ?? null,
      items: items.filter(item => item.folder_id === id),
      deleted_at: Date.now(),
    })
    storage.setItem(STORAGE_KEYS.TRASH, JSON.stringify(trash))
  }
  
  // Remove folder and its items
  folders = folders.filter(f => f.id !== id)
  items = items.filter(item => item.folder_id !== id)
  
  storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
  storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
}

// ── 回收站 ──────────────────────────────────────────────────────────────────

function purgeExpiredTrash(trash: TrashEntry[]): TrashEntry[] {
  const cutoff = Date.now() - TRASH_RETENTION_MS
  return trash.filter(entry => entry.deleted_at > cutoff)
}

/** 回收站列表（自动清除超过 30 天的条目） */
export function getTrash(): TrashEntry[] {
  initStorage()
  const trash: TrashEntry[] = JSON.parse(storage.getItem(STORAGE_KEYS.TRASH) || '[]')
  const valid = purgeExpiredTrash(trash)
  if (valid.length !== trash.length) {
    storage.setItem(STORAGE_KEYS.TRASH, JSON.stringify(valid))
  }
  return valid.sort((a, b) => b.deleted_at - a.deleted_at)
}

/** 从回收站恢复收藏夹及其收藏项 */
export function restoreFromTrash(originalFolderId: number): void {
  initStorage()
  const trash: TrashEntry[] = JSON.parse(storage.getItem(STORAGE_KEYS.TRASH) || '[]')
  const index = trash.findIndex(t => t.originalFolderId === originalFolderId)
  if (index === -1) return
  const entry = trash[index]

  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  let nextFolderId = parseInt(storage.getItem(STORAGE_KEYS.NEXT_FOLDER_ID) || '1')
  let nextItemId = parseInt(storage.getItem(STORAGE_KEYS.NEXT_ITEM_ID) || '1')

  // 若原 id 已被占用则分配新 id
  const idTaken = folders.some(f => f.id === entry.originalFolderId)
  const newFolderId = idTaken ? nextFolderId++ : entry.originalFolderId

  folders.push({
    id: newFolderId,
    name: entry.name,
    created_at: entry.created_at,
    tags: entry.tags,
    color: entry.color ?? null,
    password_hash: entry.password_hash ?? null,
    password_salt: entry.password_salt ?? null,
  })
  for (const item of entry.items) {
    items.push({ ...item, folder_id: newFolderId })
  }

  storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
  storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
  storage.setItem(STORAGE_KEYS.NEXT_FOLDER_ID, String(nextFolderId))
  storage.setItem(STORAGE_KEYS.NEXT_ITEM_ID, String(nextItemId))

  trash.splice(index, 1)
  storage.setItem(STORAGE_KEYS.TRASH, JSON.stringify(trash))
}

/** 彻底删除回收站中的单个条目 */
export function purgeTrashEntry(originalFolderId: number): void {
  initStorage()
  const trash: TrashEntry[] = JSON.parse(storage.getItem(STORAGE_KEYS.TRASH) || '[]')
  storage.setItem(STORAGE_KEYS.TRASH, JSON.stringify(trash.filter(t => t.originalFolderId !== originalFolderId)))
}

/** 清空回收站 */
export function emptyTrash(): void {
  initStorage()
  storage.setItem(STORAGE_KEYS.TRASH, JSON.stringify([]))
}

// Item operations
export async function addItem(
  folderId: number,
  itemType: 'link' | 'file',
  title: string,
  urlOrPath: string,
  category: string = '',
  coverPath: string = '',
  summary: string = '',
  tags: string[] = []
): Promise<number> {
  initStorage()
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  let nextId = parseInt(storage.getItem(STORAGE_KEYS.NEXT_ITEM_ID) || '1')
  
  const newItem: Item = {
    id: nextId,
    folder_id: folderId,
    item_type: itemType,
    title: title || null,
    url: urlOrPath || null,
    category: category || null,
    cover_path: coverPath || null,
    summary: summary || null,
    created_at: new Date().toISOString(),
    tags,
    click_count: 0
  }
  
  items.push(newItem)
  storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
  storage.setItem(STORAGE_KEYS.NEXT_ITEM_ID, String(nextId + 1))
  
  return newItem.id
}

export async function getItemsByFolder(folderId: number): Promise<Item[]> {
  initStorage()
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  return items
    .filter(item => item.folder_id === folderId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/** All items across every folder */
export async function getAllItems(): Promise<Item[]> {
  initStorage()
  return JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
}

/** The most recently added items (newest first) */
export async function getRecentItems(limit = 10): Promise<Item[]> {
  const items = await getAllItems()
  return items
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

/**
 * Items ranked by "oldest first, least clicked first" - the candidate pool
 * for the history section. Older + rarely opened items bubble to the top.
 */
export async function getHistoryPool(): Promise<Item[]> {
  const items = await getAllItems()
  return items.sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      || (a.click_count || 0) - (b.click_count || 0)
      || a.id - b.id
  )
}

/** Records that an item was opened (used by the history ranking) */
export async function incrementItemClicks(id: number): Promise<void> {
  initStorage()
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  const index = items.findIndex(i => i.id === id)
  if (index !== -1) {
    items[index].click_count = (items[index].click_count || 0) + 1
    storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
  }
}

export async function updateItem(
  id: number,
  title: string,
  urlOrPath: string,
  category: string,
  coverPath: string = '',
  summary: string = '',
  tags?: string[]
): Promise<void> {
  initStorage()
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  const index = items.findIndex(i => i.id === id)
  if (index !== -1) {
    items[index].title = title || null
    items[index].url = urlOrPath || null
    items[index].category = category || null
    items[index].cover_path = coverPath || null
    items[index].summary = summary || null
    if (tags !== undefined) items[index].tags = tags
    
    storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
  }
}

export async function deleteItem(id: number): Promise<void> {
  initStorage()
  let items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  items = items.filter(i => i.id !== id)
  storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
}

export async function deleteItems(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  
  initStorage()
  let items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  items = items.filter(i => !ids.includes(i.id))
  storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
}

// Search items
export async function searchItems(folderId: number, query: string): Promise<Item[]> {
  initStorage()
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  const lowerQuery = query.toLowerCase()
  
  return items
    .filter(item => 
      item.folder_id === folderId &&
      (
        item.title?.toLowerCase().includes(lowerQuery) ||
        item.url?.toLowerCase().includes(lowerQuery) ||
        item.category?.toLowerCase().includes(lowerQuery)
      )
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

// Export/Import
export function exportData(): string {
  return JSON.stringify({
    folders: JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]'),
    items: JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]'),
    tags: JSON.parse(storage.getItem(STORAGE_KEYS.TAGS) || '[]'),
    trash: JSON.parse(storage.getItem(STORAGE_KEYS.TRASH) || '[]'),
    version: 1,
    exported_at: new Date().toISOString()
  })
}

export function importData(jsonString: string): void {
  const data = JSON.parse(jsonString)
  
  if (data.tags && Array.isArray(data.tags)) {
    storage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(data.tags))
  }
  
  if (data.folders && Array.isArray(data.folders)) {
    storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(data.folders))
    
    // Update next folder ID
    const maxFolderId = Math.max(...data.folders.map((f: Folder) => f.id), 0)
    storage.setItem(STORAGE_KEYS.NEXT_FOLDER_ID, String(maxFolderId + 1))
  }
  
  if (data.items && Array.isArray(data.items)) {
    storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(data.items))
    
    // Update next item ID
    const maxItemId = Math.max(...data.items.map((i: Item) => i.id), 0)
    storage.setItem(STORAGE_KEYS.NEXT_ITEM_ID, String(maxItemId + 1))
  }
  
  if (data.trash && Array.isArray(data.trash)) {
    storage.setItem(STORAGE_KEYS.TRASH, JSON.stringify(data.trash))
  }
}

// Clear all data (for testing)
export function clearAllData(): void {
  storage.removeItem(STORAGE_KEYS.FOLDERS)
  storage.removeItem(STORAGE_KEYS.ITEMS)
  storage.removeItem(STORAGE_KEYS.TAGS)
  storage.removeItem(STORAGE_KEYS.NEXT_FOLDER_ID)
  storage.removeItem(STORAGE_KEYS.NEXT_ITEM_ID)
  initStorage()
}

/**
 * 一键清理：把全部收藏夹（含收藏项）移入回收站。
 * 30 天内可通过回收站恢复；到期自动彻底清除。
 */
export function moveAllToTrash(): number {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  const trash: TrashEntry[] = JSON.parse(storage.getItem(STORAGE_KEYS.TRASH) || '[]')
  const now = Date.now()

  for (const folder of folders) {
    trash.push({
      originalFolderId: folder.id,
      name: folder.name,
      created_at: folder.created_at,
      tags: folder.tags,
      color: folder.color ?? null,
      password_hash: folder.password_hash ?? null,
      password_salt: folder.password_salt ?? null,
      items: items.filter(item => item.folder_id === folder.id),
      deleted_at: now,
    })
  }

  storage.setItem(STORAGE_KEYS.TRASH, JSON.stringify(trash))
  storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify([]))
  storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify([]))
  return folders.length
}

// Password protection for folders
export async function setFolderPassword(folderId: number, passwordHash: string, salt: string): Promise<void> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  
  const index = folders.findIndex(f => f.id === folderId)
  if (index !== -1) {
    folders[index].password_hash = passwordHash
    folders[index].password_salt = salt
    storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
  }
}

export async function removeFolderPassword(folderId: number): Promise<void> {
  initStorage()
  const folders: Folder[] = JSON.parse(storage.getItem(STORAGE_KEYS.FOLDERS) || '[]')
  
  const index = folders.findIndex(f => f.id === folderId)
  if (index !== -1) {
    folders[index].password_hash = null
    folders[index].password_salt = null
    storage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders))
  }
}

// Password protection for items
export async function setItemPassword(itemId: number, passwordHash: string, salt: string): Promise<void> {
  initStorage()
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  const index = items.findIndex(i => i.id === itemId)
  if (index !== -1) {
    items[index].password_hash = passwordHash
    items[index].password_salt = salt
    storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
  }
}

export async function removeItemPassword(itemId: number): Promise<void> {
  initStorage()
  const items: Item[] = JSON.parse(storage.getItem(STORAGE_KEYS.ITEMS) || '[]')
  
  const index = items.findIndex(i => i.id === itemId)
  if (index !== -1) {
    items[index].password_hash = null
    items[index].password_salt = null
    storage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items))
  }
}
