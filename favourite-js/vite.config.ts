import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import coverProxyPlugin from './vite-plugins/coverPlugin.js'

export default defineConfig({
  plugins: [react(), coverProxyPlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  optimizeDeps: { exclude: ['sql.js'] },
  worker: { format: 'es' },
})
