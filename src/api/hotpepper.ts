// ホットペッパーグルメ API（server.js 経由）。正規化は純関数にしてテスト可能にする
import type { LatLng, Shop } from '../types';
import { S, SERVER } from '../state';
import { distanceM } from '../geo';

// API のレスポンスのうち使う項目だけ
export interface HpShop {
  id: string; name: string; lat: string | number; lng: string | number;
  genre?: { name?: string; catch?: string }; catch?: string; budget?: { name?: string };
  open?: string; close?: string; address?: string; access?: string;
  photo?: { pc?: { l?: string }; mobile?: { l?: string } }; urls?: { pc?: string };
  non_smoking?: string; private_room?: string; card?: string; parking?: string; wifi?: string; lunch?: string; midnight?: string; free_drink?: string;
}

// non_smoking: 「全面禁煙」→ 吸えない ／「一部禁煙」「禁煙席なし」→ 吸える ／ その他・未設定 → 不明
export const smokingOf = (s: HpShop): boolean | undefined =>
  /全面禁煙/.test(s.non_smoking || '') ? false : /一部禁煙|禁煙席なし/.test(s.non_smoking || '') ? true : undefined;

export function normalizeHotPepperShop(s: HpShop, center: LatLng): Shop {
  const lat = +s.lat, lng = +s.lng;
  return {
    id: 'hp:' + s.id, name: s.name, genre: s.genre?.name || '', lat, lng,
    dish: s.catch || s.genre?.catch || '情報なし', dishLabel: 'おすすめ', price: s.budget?.name || '価格帯 不明',
    hours: s.open ? s.open.split('（')[0].slice(0, 30) : '', photo: s.photo?.mobile?.l || s.photo?.pc?.l || '', url: s.urls?.pc || '',
    openNow: undefined, smoking: smokingOf(s), // ホットペッパーに「今営業中」の項目は無い
    photos: s.photo?.pc?.l ? [{ url: s.photo.pc.l, by: '' }] : [], hoursAll: s.open ? [s.open] : [], hoursNote: s.close ? '定休日: ' + s.close : '',
    address: s.address || '', access: s.access || '', tel: '', site: '', hpUrl: s.urls?.pc || '',
    amenities: [
      s.private_room && /あり/.test(s.private_room) && '個室あり', s.card && /利用可/.test(s.card) && 'カード可',
      s.parking && /あり/.test(s.parking) && '駐車場', s.wifi && /あり/.test(s.wifi) && 'Wi-Fi', s.lunch && /あり/.test(s.lunch) && 'ランチ',
      s.midnight && /^営業している/.test(s.midnight) && '深夜営業', s.free_drink && /あり/.test(s.free_drink) && '飲み放題'
    ].filter((x): x is string => !!x),
    dist: distanceM(center, { lat, lng }), source: 'ホットペッパーグルメ'
  };
}

export const rangeOf = (radius: number): number => (radius <= 300 ? 1 : radius <= 500 ? 2 : radius <= 1000 ? 3 : radius <= 2000 ? 4 : 5); // API仕様: 1=300m…5=3km

export async function fetchHotPepper(params: Record<string, string | undefined>): Promise<Shop[]> {
  const u = new URL('/api/hotpepper', S.settings.proxy);
  u.searchParams.set('lat', String(S.center.lat)); u.searchParams.set('lng', String(S.center.lng));
  u.searchParams.set('range', String(rangeOf(S.radius))); u.searchParams.set('count', '100');
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  const r = await fetch(u).catch(() => null);
  if (!r || r.status === 404) throw new Error('ホットペッパー用プロキシ（server.js）に接続できません。静的ホスティング（GitHub Pages 等）では使えないため、設定でソースを Google Places に戻すか、ローカルの server.js の URL をプロキシに指定してください');
  if (!r.ok) throw new Error('プロキシ応答 ' + r.status);
  const j = await r.json();
  if (j.results?.error) throw new Error(j.results.error[0]?.message || 'API error');
  return ((j.results?.shop || []) as HpShop[]).map(s => normalizeHotPepperShop(s, S.center)).filter(x => x.dist <= S.radius);
}

export const searchHotPepper = (gen: { hp: string; kw?: string }): Promise<Shop[]> => fetchHotPepper({ genre: gen.hp, keyword: gen.kw });

// 店名の突き合わせ用に正規化（全角→半角、空白・記号除去、小文字化）
export const normName = (s: string): string => (s || '').normalize('NFKC').toLowerCase().replace(/[\s　・･\-–—~〜()（）[\]【】「」『』]/g, '');
export function sameShop(a: Pick<Shop, 'name' | 'lat' | 'lng'>, b: Pick<Shop, 'name' | 'lat' | 'lng'>): boolean {
  if (distanceM(a, b) > 80) return false;
  const x = normName(a.name), y = normName(b.name); if (x.length < 2 || y.length < 2) return false;
  const head = (x.length <= y.length ? x : y).slice(0, 4);
  return x.includes(head) && y.includes(head);
}
// Google の結果にホットペッパーの喫煙情報（と価格帯の補完）を付与。サーバーが使えなければ黙って諦める
export async function enrichFromHotPepper(items: Shop[]): Promise<void> {
  if (!items.length || !SERVER.hotpepper) return;
  let hp: Shop[]; try { hp = await fetchHotPepper({}); } catch { return; }
  let hit = 0;
  for (const it of items) {
    const m = hp.find(h => sameShop(it, h)); if (!m) continue;
    it.smoking = m.smoking; it.hpUrl = m.url; if (/不明/.test(it.price)) it.price = m.price; hit++;
  }
  if (hit) console.info('ホットペッパー突き合わせ: ' + hit + '/' + items.length + ' 件');
}
