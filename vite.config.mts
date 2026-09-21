import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

// ビルド時に sw.template.js へ「アプリの殻」の URL 一覧とバージョンを埋め込み、dist/sw.js として出力する
function serviceWorker(): Plugin {
  let base = '/';
  return {
    name: 'gourmet-sw',
    apply: 'build',
    configResolved(c) { base = c.base.endsWith('/') ? c.base : c.base + '/'; },
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter(f => /\.(js|css)$/.test(f) && !f.endsWith('.map')).map(f => base + f);
      const precache = [base, base + 'manifest.webmanifest', base + 'icons/icon-192.png', base + 'icons/icon-512.png', ...assets];
      const version = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
      const src = readFileSync('sw.template.js', 'utf8').replace(/__VERSION__/g, JSON.stringify(version)).replace(/__PRECACHE__/g, JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
    }
  };
}

// GitHub Pages では /gourmet-app/ 配下に置くため BASE_PATH で base を切り替える（Render／ローカルは '/'）
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [serviceWorker()],
  server: {
    port: 5173,
    // 開発中は /api を server.js（8797）へ転送。アプリ側は同一オリジン扱いで動く
    proxy: { '/api': 'http://localhost:8797' }
  },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node' }
});
