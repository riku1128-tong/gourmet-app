// 「場所を変更」ダイアログ: 地名検索・履歴・半径・現在地
import type { LatLng } from '../types';
import { $, HISTORY_MAX, S, save, toast } from '../state';
import { geocodeAddress, geocoderReady, setCircleRadius } from '../maps';
import { search, setCenter } from '../search';

export function pushHistory(name: string, c: LatLng): void {
  if (!name) return;
  S.history = [{ name, lat: c.lat, lng: c.lng, at: Date.now() }, ...S.history.filter(h => h.name !== name)].slice(0, HISTORY_MAX);
  save('history', S.history);
}
export function renderHistory(): void {
  const w = $('#hist'); w.innerHTML = '';
  if (!S.history.length) return;
  const t = document.createElement('small'); t.textContent = '最近探した場所'; w.appendChild(t);
  S.history.forEach(h => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pill'; b.title = h.name;
    const s = document.createElement('span'); s.textContent = h.name; b.appendChild(s);
    b.onclick = () => { dlg().close(); pushHistory(h.name, h); setCenter({ lat: h.lat, lng: h.lng }, h.name); };
    w.appendChild(b);
  });
  const clr = document.createElement('button'); clr.type = 'button'; clr.className = 'pill clr'; clr.textContent = '履歴を消す';
  clr.onclick = () => { S.history = []; save('history', []); renderHistory(); };
  w.appendChild(clr);
}

const dlg = () => $<HTMLDialogElement>('#dlgLoc');
const q = () => $<HTMLInputElement>('#q');
let qPrefill = '';

// 入力欄の地名をジオコーディングして中心を移動。成功したら true
export async function geocodeQuery(): Promise<boolean> {
  const text = q().value.trim(); if (!text) return false;
  if (!geocoderReady()) { toast('地図の読み込みが終わっていません'); return false; }
  try {
    const g = await geocodeAddress(text);
    if (!g) { toast('「' + text + '」が見つかりませんでした'); return false; }
    dlg().close();
    pushHistory(g.name, g.c);
    await setCenter(g.c, g.name);
    return true;
  } catch (e) {
    // ZERO_RESULTS は例外として投げられることがある
    toast(/ZERO_RESULTS/.test(String(e)) ? '「' + text + '」が見つかりませんでした' : '検索に失敗しました: ' + (e instanceof Error ? e.message : String(e)));
    return false;
  }
}

export function locateMe(): void {
  if (!navigator.geolocation) { toast('位置情報が使えません'); return; }
  navigator.geolocation.getCurrentPosition(
    p => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }, null, true),
    () => { toast('現在地を取得できませんでした'); setCenter(S.center, S.locName); },
    { enableHighAccuracy: true, timeout: 8000 });
}

export function initLocation(): void {
  // ダイアログを開くと入力欄に今の場所名を入れて全選択（そのまま打てば置き換わる）
  $('#btnLoc').onclick = () => { qPrefill = S.locName || ''; q().value = qPrefill; renderHistory(); dlg().showModal(); q().select(); };
  $('#radius').querySelectorAll<HTMLElement>('.pill').forEach(b => {
    b.classList.toggle('on', +b.dataset.r! === S.radius);
    b.onclick = () => { S.radius = +b.dataset.r!; save('radius', S.radius); $('#radius').querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x === b)); setCircleRadius(S.radius); };
  });
  $('#btnGeo').onclick = () => { geocodeQuery(); };
  q().addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); geocodeQuery(); } });
  $('#btnHere').onclick = () => { dlg().close(); locateMe(); };
  // 「この場所で探す」：地名を書き換えていればそれで移動、初期表示のまま（または空）ならピン位置・半径で再検索
  $('#btnApply').onclick = async () => {
    const text = q().value.trim();
    if (text && text !== qPrefill) { await geocodeQuery(); return; }
    dlg().close(); search();
  };
}
