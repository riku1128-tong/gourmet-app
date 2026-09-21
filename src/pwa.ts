// PWA: Service Worker の登録・更新通知・お気に入り写真のオフラインキャッシュ
import type { Shop } from './types';
import { $ } from './state';

const PHOTOS = 'photos-v1';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return; // dev ではキャッシュで混乱しないよう登録しない
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then(reg => {
    // 新しいビルドが配信されたら「更新があります」バナー（勝手にはリロードしない）
    const watch = (w: ServiceWorker | null) => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(); }); };
    watch(reg.waiting ? null : reg.installing);
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar();
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(e => console.warn('Service Worker 登録失敗', e));
}
function showUpdateBar(): void {
  const bar = $('#updatebar'); bar.classList.add('on');
  $('#updateGo').onclick = () => { navigator.serviceWorker.getRegistration().then(r => r?.waiting?.postMessage('skipWaiting')); setTimeout(() => location.reload(), 300); };
  $('#updateNo').onclick = () => bar.classList.remove('on');
}

// お気に入りの写真をキャッシュに入れる／外す（オフラインでも一覧と詳細の写真が見えるように）。失敗は無視
export function cachePhotos(it: Shop): void {
  if (!('caches' in window)) return;
  const urls = [it.photo, ...(it.photos || []).map(p => p.url)].filter((u, i, a) => u && a.indexOf(u) === i);
  caches.open(PHOTOS).then(c => Promise.all(urls.map(u => c.add(new Request(u, { mode: 'no-cors' })).catch(() => undefined)))).catch(() => undefined);
}
export function uncachePhotos(it: Shop): void {
  if (!('caches' in window)) return;
  const urls = [it.photo, ...(it.photos || []).map(p => p.url)].filter(Boolean);
  caches.open(PHOTOS).then(c => Promise.all(urls.map(u => c.delete(u)))).catch(() => undefined);
}

export const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;
