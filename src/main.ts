import './styles.css';
import { $, LS, S } from './state';
import { buildTaste, restoreExpired } from './taste';
import { initMap, loadMaps } from './maps';
import { probeServer, fetchDishes } from './api/server';
import { enrichFromHotPepper } from './api/hotpepper';
import { refresh, setCenter } from './search';
import { initNav, showView } from './ui/nav';
import { initFilters } from './ui/filters';
import { initLists, renderLists } from './ui/lists';
import { initSheet } from './ui/sheet';
import { initLocation, locateMe } from './ui/location';
import { initSettings } from './ui/settings';
import { SERVER } from './state';
import { isOffline, registerServiceWorker } from './pwa';

// サーバーの確認が検索より遅れて終わった場合に、後追いで補完する
function probe(): void {
  probeServer(() => {
    if (!S.results.length) return;
    if (SERVER.hotpepper) enrichFromHotPepper(S.results).then(refresh); // renderDeck が名物も取りに行く
    else if (SERVER.dish) fetchDishes(S.queue.slice(0, S.shown));
  });
}

// 開発時だけ、ブラウザのコンソールや自動検証から内部に触れるようにする（本番ビルドには含まれない）
if (import.meta.env.DEV) {
  Promise.all([import('./ui/deck'), import('./ui/sheet'), import('./ui/filters'), import('./ui/location'), import('./api/server'), import('./taste'), import('./search')])
    .then(([deck, sheet, filters, location, server, taste, search]) => {
      (window as unknown as { __app: unknown }).__app = { S, SERVER, ...deck, ...sheet, ...filters, ...location, ...server, ...taste, ...search, showView, renderLists };
    });
}

// オフライン時: 地図と検索は諦めて、お気に入り（写真はキャッシュ済み）を見られるようにする。回線が戻ったら再読み込み
function showOffline(): void {
  $('#locname').textContent = 'オフライン';
  const box = document.createElement('div'); box.className = 'offline';
  box.innerHTML = '<b>オフラインです</b><p>地図と検索にはインターネット接続が必要です。<br>お気に入りに入れたお店はオフラインでも見られます。</p>';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.textContent = 'お気に入りを見る（' + S.favs.length + '件）'; b.onclick = () => showView('fav');
  box.appendChild(b); $('#deck').innerHTML = ''; $('#deck').appendChild(box);
  if (S.favs.length) showView('fav');
  window.addEventListener('online', () => location.reload(), { once: true });
}

(async () => {
  restoreExpired(); buildTaste();
  initNav(); initFilters(); initLists(); initSheet(); initLocation(); initSettings(probe);
  renderLists(); registerServiceWorker();
  if (isOffline()) { showOffline(); return; }
  probe();
  if (!S.settings.gkey) {
    $('#locname').textContent = 'APIキーを設定してください';
    $('#deck').innerHTML = '<div class="empty"><b>Google Maps API キーが未設定です</b><p>「設定」タブでキーを保存すると地図と検索が有効になります。</p></div>';
    showView('set'); return;
  }
  try { await loadMaps(S.settings.gkey); await initMap(c => { setCenter(c, null, true); }); }
  catch (e) {
    if (isOffline()) { showOffline(); return; }
    console.error('Google Maps 初期化エラー', e);
    $('#deck').innerHTML = '<div class="empty"><b>Google Maps を読み込めませんでした</b><p>APIキーと有効化したAPI（Maps JavaScript / Places (New) / Geocoding）を確認してください。</p><p class="err" style="color:var(--accent);word-break:break-all"></p></div>';
    $('#deck .err').textContent = 'エラー: ' + (e instanceof Error ? e.message : String(e));
    return;
  }
  if (LS<unknown>('center', null)) setCenter(S.center, null, true); else locateMe();
})();
