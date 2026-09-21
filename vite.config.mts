import { defineConfig } from 'vitest/config';

// GitHub Pages では /gourmet-app/ 配下に置くため BASE_PATH で base を切り替える（Render／ローカルは '/'）
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: {
    port: 5173,
    // 開発中は /api を server.js（8797）へ転送。アプリ側は同一オリジン扱いで動く
    proxy: { '/api': 'http://localhost:8797' }
  },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node' }
});
