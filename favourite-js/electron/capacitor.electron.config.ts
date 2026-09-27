import { join } from 'path';
import { defineConfig } from '@capawesome/capacitor-electron/config';

export default defineConfig({
  window: {
    width: 1200,
    height: 800,
  },
  hooks: {
    windowFactory(options) {
      // __dirname at runtime is the *compiled* output dir (electron/build/).
      // preload.js lives one level up in electron/preload.js.
      options.webPreferences = {
        ...options.webPreferences,
        preload: join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      };
      const { BrowserWindow } = require('electron');
      const win = new BrowserWindow(options);
      // 调试开关：设置环境变量 ELECTRON_DEBUG=1 后启动打包版，
      // 会自动打开 DevTools（生产构建默认禁用了 F12，方便排查问题）。
      if (process.env.ELECTRON_DEBUG) {
        win.webContents.openDevTools({ mode: 'detach' });
      }
      return win;
    },
  },
});
