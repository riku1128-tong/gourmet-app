// 好みの学習。お気に入り／削除の履歴からジャンル・価格帯・距離帯のスコアを都度計算する（別データは持たない）
import type { DeleteReason, SavedShop, Shop } from './types';
import { S, save } from './state';

export const REASONS: Record<DeleteReason, { label: string; days?: number }> = {
  high: { label: '高い' }, far: { label: '遠い' },
  mood: { label: '今の気分じゃない', days: 7 }, // 7 日後に自動復旧
  none: { label: '興味なし' }
};

type Feature = 'genre' | 'price' | 'dist';
type Weights = Record<Feature, number>;
export interface Taste { genre: Record<string, number>; price: Record<string, number>; dist: Record<string, number>; n: number }

export const DIST_BAND = (m: number): string => (m < 300 ? 'near' : m < 700 ? 'mid' : 'far');
const FAV_W: Weights = { genre: 1, price: 0.5, dist: 0.3 };
const DEL_W: Record<DeleteReason, Weights> = {
  high: { genre: -0.3, price: -1, dist: 0 }, far: { genre: 0, price: 0, dist: -1 },
  mood: { genre: -0.2, price: 0, dist: 0 }, none: { genre: -0.7, price: -0.3, dist: 0 }
};

// 純関数: 履歴から好みテーブルを作る
export function computeTaste(favs: SavedShop[], deleted: SavedShop[]): Taste {
  const t: Taste = { genre: {}, price: {}, dist: {}, n: 0 };
  const add = (it: Shop, w: Weights) => {
    const key: Record<Feature, string | null> = { genre: it.genre, price: /不明/.test(it.price) ? null : it.price, dist: DIST_BAND(it.dist) };
    for (const f of ['genre', 'price', 'dist'] as Feature[]) { const k = key[f]; if (w[f] && k) t[f][k] = (t[f][k] || 0) + w[f]; }
    t.n++;
  };
  favs.forEach(it => add(it, FAV_W));
  deleted.forEach(it => add(it, DEL_W[it.reason ?? 'none'] ?? DEL_W.none));
  return t;
}
// 純関数: -1（苦手）〜 +1（好み）。履歴が無ければ 0
export function scoreWith(t: Taste, it: Shop): number {
  if (!t.n) return 0;
  const s = (t.genre[it.genre] || 0) + (t.price[it.price] || 0) + (t.dist[DIST_BAND(it.dist)] || 0);
  return Math.tanh(s / 2);
}
// 純関数: おまかせの並び。近さ 0.5 ＋ 好み 0.5 ＋ 乱数 0.3。履歴が無いときは「近い順＋ランダム」と同じ挙動になる
export function rankWith(t: Taste, list: Shop[], radius: number, rnd: () => number = Math.random): Shop[] {
  return list.map(it => ({ it, s: 0.5 * (1 - Math.min(1, it.dist / radius)) + 0.5 * scoreWith(t, it) + rnd() * 0.3 }))
    .sort((a, b) => b.s - a.s).map(x => x.it);
}

// ---- アプリ状態に結び付けたラッパー ----
export let TASTE: Taste = { genre: {}, price: {}, dist: {}, n: 0 };
export function buildTaste(): Taste { TASTE = computeTaste(S.favs, S.deleted); return TASTE; }
export const tasteScore = (it: Shop): number => scoreWith(TASTE, it);
export const isLiked = (it: Shop): boolean => TASTE.n >= 3 && tasteScore(it) >= 0.45;
export const rankOmakase = (list: Shop[]): Shop[] => rankWith(TASTE, list, S.radius);

// 「今の気分じゃない」の期限切れを削除管理から自動で外す（＝再び提案される）
export function restoreExpired(): void {
  const now = Date.now(), keep = S.deleted.filter(x => !(x.expires && x.expires <= now));
  if (keep.length !== S.deleted.length) { S.deleted = keep; save('deleted', S.deleted); }
}
