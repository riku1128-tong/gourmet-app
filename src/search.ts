// 検索の起点: 中心の変更 → 検索 → キュー構築。UI の描画は ui/deck に任せる
import type { LatLng, Shop } from './types';
import { $, GENRES, NEAR_M, PAGE, S, save, toast } from './state';
import { searchGoogle } from './api/google';
import { searchHotPepper } from './api/hotpepper';
import { fetchWeather } from './api/weather';
import { moveCenter, reverseGeocode } from './maps';
import { buildTaste, rankOmakase, restoreExpired } from './taste';
import { renderDeck } from './ui/deck';
import { renderFilters, renderRainbar, resetRainDismissed } from './ui/filters';

export async function setCenter(c: LatLng, name?: string | null, reverse?: boolean): Promise<void> {
  S.center = c; save('center', c);
  moveCenter(c);
  if (name) S.locName = name;
  else if (reverse) S.locName = (await reverseGeocode(c)) ?? S.locName;
  $('#locname').textContent = S.locName;
  // 検索と並行して天気を取得（失敗しても検索には影響しない）
  fetchWeather(c).then(() => { resetRainDismissed(); renderFilters(); renderRainbar(); });
  await search();
}

export async function search(): Promise<void> {
  restoreExpired(); S.results = []; S.shown = PAGE; renderDeck(true);
  const gen = GENRES.find(g => g.label === S.genre) ?? GENRES[0];
  try {
    S.results = S.settings.source === 'hotpepper' ? await searchHotPepper(gen) : await searchGoogle(gen);
  } catch (e) { console.error(e); toast('検索に失敗: ' + (e instanceof Error ? e.message : String(e))); }
  S.results.sort((a, b) => a.dist - b.dist);
  if (S.genre === 'おまかせ') { buildTaste(); S.results = rankOmakase(S.results); } // 近さ＋好み＋乱数で並べ替え
  rebuildQueue(); renderDeck();
}

// 絞り込みはクライアント側で適用（再検索しない）。情報が無い店（undefined）は「該当しない」扱い
export function passFilters(r: Shop): boolean {
  const f = S.filters;
  if (f.open && r.openNow !== true) return false;
  if (f.near && r.dist > NEAR_M) return false;
  if (f.smoke && r.smoking !== true) return false;
  return true;
}
export function rebuildQueue(): void {
  buildTaste();
  const hide = new Set([...S.favs, ...S.deleted].map(x => x.id));
  S.queue = S.results.filter(r => !hide.has(r.id) && passFilters(r));
}
// キューを作り直して描画まで行う（一覧側の操作から呼ぶ）
export function refresh(): void { rebuildQueue(); renderDeck(); }
