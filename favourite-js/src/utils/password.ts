// Password utilities using Web Crypto API

// Generate a random salt
export function generateSalt(): string {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  return arrayBufferToBase64(salt)
}

// Convert Uint8Array to base64 string
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Convert base64 string to Uint8Array
function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Hash password with SHA-256 and salt
export async function hashPassword(password: string, saltBase64: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = base64ToArrayBuffer(saltBase64)
  const data = encoder.encode(password)
  const combined = new Uint8Array(data.length + salt.length)
  combined.set(data)
  combined.set(salt, data.length)
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined)
  return arrayBufferToBase64(new Uint8Array(hashBuffer))
}

// Verify password
export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const hash = await hashPassword(password, salt)
  return hash === storedHash
}

// ── 解锁状态（内存态）─────────────────────────────────────────────────────────
// 之前的实现把解锁状态存进 sessionStorage：应用进程还活着时一直有效，
// 只有完全退出才会重新上锁。现在改为纯内存 Set：每次打开应用（页面刷新、
// WebView 重建）都要重新输入密码，安全性和预期一致。

const unlockedKeys = new Set<string>()

function unlockKey(type: 'folder' | 'item', id: number): string {
  return `${type}-${id}`
}

// Check if folder/item is unlocked
export function isItemUnlocked(type: 'folder' | 'item', id: number): boolean {
  return unlockedKeys.has(unlockKey(type, id))
}

// Mark as unlocked
export function setItemUnlocked(type: 'folder' | 'item', id: number): void {
  unlockedKeys.add(unlockKey(type, id))
}

// Lock (remove from memory)
export function lockItem(type: 'folder' | 'item', id: number): void {
  unlockedKeys.delete(unlockKey(type, id))
}

// Lock all items
export function lockAll(): void {
  unlockedKeys.clear()
}
