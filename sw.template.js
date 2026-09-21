/* Service Worker のテンプレート。ビルド時に vite.config.mts のプラグインが
   __VERSION__ と __PRECACHE__（base 付きのアプリの殻の URL 一覧）を埋めて dist/sw.js に出力する。
   方針:
   - アプリの殻（index.html / ハッシュ付き JS・CSS / manifest / アイコン）は install 時に事前キャッシュ
   - ページ本体はネット優先、失敗したらキャッシュ（オフライン起動用）
   - ハッシュ付きアセットはキャッシュ優先
   - /api/ と Google Maps・Open-Meteo は素通し（キャッシュしない）
   - 画像は「写真キャッシュ」にあれば返す。写真はアプリがお気に入り登録時に入れる（全部は溜めない） */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const BASE = PRECACHE[0];               // 先頭は base（末尾スラッシュ付き）
const SHELL = 'shell-' + VERSION;
const PHOTOS = 'photos-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(BASE) || url.pathname.startsWith(BASE + 'api/')) return; // API は素通し
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(BASE, copy)); return r; })
        .catch(() => caches.match(BASE)));
      return;
    }
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
  if (req.destination === 'image') {
    e.respondWith(caches.open(PHOTOS).then((c) => c.match(req.url, { ignoreVary: true })).then((r) => r || fetch(req)));
  }
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
